import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { MutationResult } from "@/types/api";
import type { RequirementsQuery } from "@/schemas/list-queries";
import type {
  RequirementCreateInput,
  RequirementUpdateInput,
} from "@/schemas/requirement-mutations";
import {
  listRequirementsScoped,
  type ListRequirementsResult,
  type RequirementRow,
  countRequirementsInProject,
  findLinkedRequirementById,
  findRequirementRowById,
  generateRequirementDisplayId,
  insertRequirement,
  updateRequirementById,
} from "@/repositories/requirement.repository";
import {
  findAccessibleProjectById,
  findProjectRowById,
} from "@/repositories/project.repository";
import { findAccessibleSprintById } from "@/repositories/sprint.repository";
import { DbWriteError, isUserOrgMember } from "@/repositories/mutation-helpers";

/**
 * Requirement service — business-logic seam between API routes and
 * repositories.
 *
 * Ownership: Backend/API agent (`src/services/**`).
 *
 * Read contract (unchanged): `null` propagates the "scoped project not
 * accessible" signal so the route returns 404 without leaking existence.
 *
 * Write authorization (server-derived `RequestScope` only):
 * - Create: ADMIN or PROJECT_MANAGER in the requirement's project
 *   organization. DEVELOPER has no insert path (RLS provides no
 *   `requirements_insert_*` policy for developers) → FORBIDDEN.
 * - Update (staff): ADMIN/PROJECT_MANAGER in the project organization —
 *   full field access including reassignment (assignee must stay inside the
 *   organization) and same-project sprint/dependency linkage.
 * - Update (developer): only rows currently assigned to the caller, staying
 *   assigned to the caller (any `assigneeId` key in a developer body →
 *   FORBIDDEN, no reassignment in either direction), same project
 *   (project/display moves → VALIDATION_ERROR), same-project sprint and
 *   dependency linkage. RLS `requirements_update_dev_self` re-enforces all
 *   of this at the database layer.
 * - `display_id` is always server-generated (`<PROJECTCODE>-<NNN>`,
 *   project-scoped unique) and immutable; client values are never read.
 */

function forbidden(message = "Insufficient permissions"): MutationResult<never> {
  return { ok: false, failure: { code: "FORBIDDEN", message } };
}

function notFound(message = "Requirement not found"): MutationResult<never> {
  return { ok: false, failure: { code: "NOT_FOUND", message } };
}

function invalid(
  field: string,
  message: string,
): MutationResult<never> {
  return {
    ok: false,
    failure: { code: "VALIDATION_ERROR", message, details: [{ field, message }] },
  };
}

function isStaffRole(role: string | undefined): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER";
}

export async function listRequirements(
  client: SupabaseClient,
  scope: RequestScope,
  filters: RequirementsQuery,
): Promise<ListRequirementsResult | null> {
  return listRequirementsScoped(client, scope, filters);
}

/**
 * Returns one requirement whose project is accessible to the caller, or
 * `null` when it does not exist or its project is outside the caller's
 * scope (no existence oracle). Read-only: no role gate and no assignee
 * check — every member with project visibility (including DEVELOPER) may
 * read. The row and its project probe both run through the caller's
 * RLS-enforcing client; the explicit `organizationIds` check is
 * defense-in-depth.
 */
export async function getRequirementById(
  client: SupabaseClient,
  scope: RequestScope,
  requirementId: string,
): Promise<RequirementRow | null> {
  if (scope.organizationIds.length === 0) return null;
  const row = await findRequirementRowById(client, requirementId);
  if (!row) return null;
  const project = await findAccessibleProjectById(
    client,
    scope,
    row.project_id,
  );
  if (!project) return null;
  if (!scope.organizationIds.includes(project.organization_id)) {
    return null;
  }
  return row;
}

async function checkAssigneeInOrg(
  client: SupabaseClient,
  assigneeId: string,
  organizationId: string,
): Promise<MutationResult<never> | null> {
  const member = await isUserOrgMember(client, assigneeId, organizationId);
  if (!member) {
    return invalid(
      "assigneeId",
      "assigneeId must reference a member of the project organization",
    );
  }
  return null;
}

async function checkSprintInProject(
  client: SupabaseClient,
  scope: RequestScope,
  sprintId: string,
  projectId: string,
): Promise<MutationResult<never> | null> {
  const sprint = await findAccessibleSprintById(client, scope, sprintId);
  if (!sprint || sprint.project_id !== projectId) {
    return invalid(
      "sprintId",
      "sprintId must reference a sprint in the same project",
    );
  }
  return null;
}

async function checkDependencyInProject(
  client: SupabaseClient,
  dependencyId: string,
  projectId: string,
  selfId?: string,
): Promise<MutationResult<never> | null> {
  if (selfId !== undefined && dependencyId === selfId) {
    return invalid(
      "dependencyId",
      "dependencyId must not reference the requirement itself",
    );
  }
  const dependency = await findLinkedRequirementById(client, dependencyId);
  if (!dependency || dependency.project_id !== projectId) {
    return invalid(
      "dependencyId",
      "dependencyId must reference a requirement in the same project",
    );
  }
  return null;
}

/**
 * Creates one requirement in an accessible project. The display ID is
 * generated server-side; the project is derived/verified server-side
 * (no `organizationId` is read from the body).
 */
export async function createRequirement(
  client: SupabaseClient,
  scope: RequestScope,
  input: RequirementCreateInput,
): Promise<MutationResult<RequirementRow>> {
  const project = await findProjectRowById(client, input.projectId);
  if (!project) {
    return { ok: false, failure: { code: "NOT_FOUND", message: "Project not found" } };
  }
  if (!isStaffRole(scope.rolesByOrg[project.organization_id])) {
    return forbidden();
  }
  const organizationId = project.organization_id;

  if (typeof input.assigneeId === "string") {
    const verdict = await checkAssigneeInOrg(client, input.assigneeId, organizationId);
    if (verdict) return verdict;
  }
  if (typeof input.sprintId === "string") {
    const verdict = await checkSprintInProject(client, scope, input.sprintId, project.id);
    if (verdict) return verdict;
  }
  if (typeof input.dependencyId === "string") {
    const verdict = await checkDependencyInProject(client, input.dependencyId, project.id);
    if (verdict) return verdict;
  }

  // Display-ID generation races (concurrent creates) retry with a fresh
  // sequence; the UNIQUE(project_id, display_id) constraint is final.
  let conflict: DbWriteError | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const count = await countRequirementsInProject(client, project.id);
    const displayId = await generateRequirementDisplayId(
      client,
      project.id,
      project.code,
      count + 1,
    );
    try {
      const created = await insertRequirement(client, {
        display_id: displayId,
        project_id: project.id,
        title: input.title,
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        category: input.category,
        ...(input.businessValue !== undefined
          ? { business_value: input.businessValue }
          : {}),
        ...(input.customerImportance !== undefined
          ? { customer_importance: input.customerImportance }
          : {}),
        ...(input.urgency !== undefined ? { urgency: input.urgency } : {}),
        ...(input.complexity !== undefined
          ? { complexity: input.complexity }
          : {}),
        ...(input.estimatedEffort !== undefined
          ? { estimated_effort: input.estimatedEffort }
          : {}),
        ...(input.risk !== undefined ? { risk: input.risk } : {}),
        ...(input.storyPoints !== undefined
          ? { story_points: input.storyPoints }
          : {}),
        ...(input.dependencyId !== undefined
          ? { dependency_id: input.dependencyId }
          : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.assigneeId !== undefined
          ? { assignee_id: input.assigneeId }
          : {}),
        ...(input.sprintId !== undefined ? { sprint_id: input.sprintId } : {}),
      });
      return { ok: true, data: created };
    } catch (error) {
      if (error instanceof DbWriteError && error.kind === "unique_violation") {
        conflict = error;
        continue;
      }
      if (error instanceof DbWriteError) {
        if (error.kind === "rls_denied") return forbidden();
        if (error.kind === "foreign_key") {
          return invalid("projectId", "Referenced record does not exist");
        }
      }
      throw error;
    }
  }
  throw conflict ?? new DbWriteError("failed", "requirement_insert_failed");
}

/**
 * Updates one accessible requirement under the staff/developer split
 * described above.
 */
export async function updateRequirement(
  client: SupabaseClient,
  scope: RequestScope,
  requirementId: string,
  input: RequirementUpdateInput,
): Promise<MutationResult<RequirementRow>> {
  if (input.projectIdAttempt !== undefined) {
    return invalid("projectId", "projectId cannot be changed");
  }
  if (input.displayIdAttempt === true) {
    return invalid("displayId", "displayId cannot be changed");
  }

  const current = await findRequirementRowById(client, requirementId);
  if (!current) {
    return notFound();
  }
  const project = await findAccessibleProjectById(
    client,
    scope,
    current.project_id,
  );
  if (!project) {
    return notFound();
  }

  const staff = isStaffRole(scope.rolesByOrg[project.organization_id]);
  if (!staff) {
    if (current.assignee_id !== scope.userId) {
      return forbidden();
    }
    if (input.assigneeId !== undefined) {
      return forbidden("Requirements cannot be reassigned by developers");
    }
  }

  const patch: {
    title?: string;
    description?: string | null;
    category?: string;
    business_value?: string;
    customer_importance?: number | null;
    urgency?: number | null;
    complexity?: number | null;
    estimated_effort?: number | null;
    risk?: number | null;
    story_points?: number | null;
    dependency_id?: string | null;
    priority?: string;
    status?: string;
    assignee_id?: string | null;
    sprint_id?: string | null;
  } = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.category !== undefined) patch.category = input.category;
  if (input.businessValue !== undefined)
    patch.business_value = input.businessValue;
  if (input.customerImportance !== undefined)
    patch.customer_importance = input.customerImportance;
  if (input.urgency !== undefined) patch.urgency = input.urgency;
  if (input.complexity !== undefined) patch.complexity = input.complexity;
  if (input.estimatedEffort !== undefined)
    patch.estimated_effort = input.estimatedEffort;
  if (input.risk !== undefined) patch.risk = input.risk;
  if (input.storyPoints !== undefined) patch.story_points = input.storyPoints;
  if (input.dependencyId !== undefined)
    patch.dependency_id = input.dependencyId;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.status !== undefined) patch.status = input.status;
  if (input.assigneeId !== undefined) patch.assignee_id = input.assigneeId;
  if (input.sprintId !== undefined) patch.sprint_id = input.sprintId;

  if (Object.keys(patch).length === 0) {
    return invalid("body", "Request body must include at least one editable field");
  }

  if (typeof patch.assignee_id === "string") {
    const verdict = await checkAssigneeInOrg(
      client,
      patch.assignee_id,
      project.organization_id,
    );
    if (verdict) return verdict;
  }
  if (typeof patch.sprint_id === "string") {
    const verdict = await checkSprintInProject(
      client,
      scope,
      patch.sprint_id,
      project.id,
    );
    if (verdict) return verdict;
  }
  if (typeof patch.dependency_id === "string") {
    const verdict = await checkDependencyInProject(
      client,
      patch.dependency_id,
      project.id,
      requirementId,
    );
    if (verdict) return verdict;
  }

  try {
    const updated = await updateRequirementById(client, requirementId, patch);
    if (!updated) {
      return notFound();
    }
    return { ok: true, data: updated };
  } catch (error) {
    if (error instanceof DbWriteError) {
      if (error.kind === "rls_denied") return forbidden();
      if (error.kind === "foreign_key") {
        return invalid("projectId", "Referenced record does not exist");
      }
    }
    throw error;
  }
}
