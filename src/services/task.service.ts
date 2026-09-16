import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { MutationResult } from "@/types/api";
import type { TasksQuery } from "@/schemas/list-queries";
import type {
  TaskCreateInput,
  TaskUpdateInput,
} from "@/schemas/task-mutations";
import {
  listTasksScoped,
  type ListTasksResult,
  type TaskRow,
  countTasksInProject,
  findTaskRowById,
  generateTaskDisplayId,
  insertTask,
  updateTaskById,
} from "@/repositories/task.repository";
import {
  findAccessibleProjectById,
  findProjectRowById,
} from "@/repositories/project.repository";
import { findAccessibleSprintById } from "@/repositories/sprint.repository";
import { findLinkedRequirementById } from "@/repositories/requirement.repository";
import { DbWriteError, isUserOrgMember } from "@/repositories/mutation-helpers";

/**
 * Task service — business-logic seam between API routes and repositories.
 *
 * Ownership: Backend/API agent (`src/services/**`).
 *
 * Read contract (unchanged): `null` propagates the "scoped project not
 * accessible" signal so the route returns 404 without leaking existence. The
 * `assignee` filter only narrows rows RLS already permits — it can never
 * broaden visibility.
 *
 * Write authorization (server-derived `RequestScope` only):
 * - Create: ADMIN or PROJECT_MANAGER in the task's project organization.
 *   DEVELOPER has no insert path (RLS provides no `tasks_insert_*` policy
 *   for developers) → FORBIDDEN.
 * - Update (staff): ADMIN/PROJECT_MANAGER in the project organization —
 *   full field access including reassignment (assignee must stay inside the
 *   organization) and same-project sprint/requirement linkage.
 * - Update (developer): only rows currently assigned to the caller, staying
 *   assigned to the caller (any `assigneeId` key in a developer body →
 *   FORBIDDEN — no claiming unassigned tasks, no giving tasks away, no
 *   assigning peers), same project (project/display moves → 400,
 *   org moves → 403), same-project sprint and requirement linkage.
 *   Status advances on the caller's own task flow through the same path and
 *   succeed when the RLS `tasks_update_dev_self` policy permits them; any
 *   RLS denial surfaces as 403, never 500. RLS re-enforces all of this at
 *   the database layer.
 * - `display_id` is always server-generated (`TASK-NNN`, project-scoped
 *   unique) and immutable; client values are never read.
 */

function forbidden(message = "Insufficient permissions"): MutationResult<never> {
  return { ok: false, failure: { code: "FORBIDDEN", message } };
}

function notFound(message = "Task not found"): MutationResult<never> {
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

export async function listTasks(
  client: SupabaseClient,
  scope: RequestScope,
  filters: TasksQuery,
): Promise<ListTasksResult | null> {
  return listTasksScoped(client, scope, filters);
}

/**
 * Returns one task whose project is accessible to the caller, or `null`
 * when it does not exist or its project is outside the caller's scope (no
 * existence oracle). Read-only: no role gate, no `assignee=me` requirement
 * — developers may READ any task they otherwise have access to (the
 * developer mutation restriction applies to PATCH only). The row and its
 * project probe both run through the caller's RLS-enforcing client; the
 * explicit `organizationIds` check is defense-in-depth.
 */
export async function getTaskById(
  client: SupabaseClient,
  scope: RequestScope,
  taskId: string,
): Promise<TaskRow | null> {
  if (scope.organizationIds.length === 0) return null;
  const row = await findTaskRowById(client, taskId);
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

async function checkRequirementInProject(
  client: SupabaseClient,
  requirementId: string,
  projectId: string,
): Promise<MutationResult<never> | null> {
  const requirement = await findLinkedRequirementById(client, requirementId);
  if (!requirement || requirement.project_id !== projectId) {
    return invalid(
      "requirementId",
      "requirementId must reference a requirement in the same project",
    );
  }
  return null;
}

/**
 * Creates one task in an accessible project. The display ID is generated
 * server-side; the project is derived/verified server-side (no
 * `organizationId` is read from the body).
 */
export async function createTask(
  client: SupabaseClient,
  scope: RequestScope,
  input: TaskCreateInput,
): Promise<MutationResult<TaskRow>> {
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
  if (typeof input.requirementId === "string") {
    const verdict = await checkRequirementInProject(client, input.requirementId, project.id);
    if (verdict) return verdict;
  }

  // Display-ID generation races (concurrent creates) retry with a fresh
  // sequence; the UNIQUE(project_id, display_id) constraint is final.
  let conflict: DbWriteError | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const count = await countTasksInProject(client, project.id);
    const displayId = await generateTaskDisplayId(
      client,
      project.id,
      count + 1,
    );
    try {
      const created = await insertTask(client, {
        display_id: displayId,
        project_id: project.id,
        title: input.title,
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.points !== undefined ? { points: input.points } : {}),
        ...(input.assigneeId !== undefined
          ? { assignee_id: input.assigneeId }
          : {}),
        ...(input.sprintId !== undefined ? { sprint_id: input.sprintId } : {}),
        ...(input.requirementId !== undefined
          ? { requirement_id: input.requirementId }
          : {}),
        ...(input.columnStatus !== undefined
          ? { column_status: input.columnStatus }
          : {}),
        ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
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
  throw conflict ?? new DbWriteError("failed", "task_insert_failed");
}

/**
 * Updates one accessible task under the staff/developer split described
 * above. Developer status advances on self-assigned tasks succeed when RLS
 * permits them; every other developer mutation is denied with 403.
 */
export async function updateTask(
  client: SupabaseClient,
  scope: RequestScope,
  taskId: string,
  input: TaskUpdateInput,
): Promise<MutationResult<TaskRow>> {
  if (input.organizationIdAttempt !== undefined) {
    return forbidden("Task organization cannot be changed");
  }
  if (input.projectIdAttempt !== undefined) {
    return invalid("projectId", "projectId cannot be changed");
  }
  if (input.displayIdAttempt === true) {
    return invalid("displayId", "displayId cannot be changed");
  }

  const current = await findTaskRowById(client, taskId);
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
      return forbidden("Tasks cannot be reassigned by developers");
    }
  }

  const patch: {
    title?: string;
    description?: string | null;
    priority?: string;
    points?: number | null;
    assignee_id?: string | null;
    sprint_id?: string | null;
    requirement_id?: string | null;
    column_status?: string;
    due_date?: string | null;
  } = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.points !== undefined) patch.points = input.points;
  if (input.assigneeId !== undefined) patch.assignee_id = input.assigneeId;
  if (input.sprintId !== undefined) patch.sprint_id = input.sprintId;
  if (input.requirementId !== undefined)
    patch.requirement_id = input.requirementId;
  if (input.columnStatus !== undefined) patch.column_status = input.columnStatus;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate;

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
  if (typeof patch.requirement_id === "string") {
    const verdict = await checkRequirementInProject(
      client,
      patch.requirement_id,
      project.id,
    );
    if (verdict) return verdict;
  }

  try {
    const updated = await updateTaskById(client, taskId, patch);
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
      if (error.kind === "unique_violation") {
        return invalid("body", "Task could not be updated");
      }
    }
    throw error;
  }
}
