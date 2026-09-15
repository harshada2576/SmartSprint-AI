import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { MutationResult } from "@/types/api";
import type { ProjectsQuery } from "@/schemas/list-queries";
import type {
  ProjectCreateInput,
  ProjectUpdateInput,
} from "@/schemas/project-mutations";
import {
  listProjectsScoped,
  type ListProjectsResult,
  type ProjectRow,
  findAccessibleProjectById,
  generateProjectCode,
  insertProject,
  isProjectCodeTaken,
  updateProjectById,
} from "@/repositories/project.repository";
import { DbWriteError, isUserOrgMember } from "@/repositories/mutation-helpers";

/**
 * Project service — business-logic seam between API routes and repositories.
 *
 * Ownership: Backend/API agent (`src/services/**`).
 *
 * Authorization (server-derived `RequestScope` only — never request claims):
 * - Create/update: ADMIN or PROJECT_MANAGER in the target organization.
 *   DEVELOPER (and membership-less callers) receive FORBIDDEN.
 * - The organization is derived from membership: an explicit
 *   `organizationId` body value is only a selector verified against the
 *   caller's staff orgs (foreign values → FORBIDDEN, never trusted).
 * - Updates verify the project is accessible first (inaccessible → NOT_FOUND,
 *   no existence oracle), then enforce the staff gate in the project's own
 *   organization. Organization transfer is rejected; membership changes are
 *   out of scope for this endpoint (ADMIN-only `project_members` policies).
 */

function forbidden(message = "Insufficient permissions"): MutationResult<never> {
  return { ok: false, failure: { code: "FORBIDDEN", message } };
}

function notFound(message = "Project not found"): MutationResult<never> {
  return { ok: false, failure: { code: "NOT_FOUND", message } };
}

function invalid(message: string): MutationResult<never> {
  return { ok: false, failure: { code: "VALIDATION_ERROR", message } };
}

function staffOrgIds(scope: RequestScope): string[] {
  return scope.organizationIds.filter((orgId) => {
    const role = scope.rolesByOrg[orgId];
    return role === "ADMIN" || role === "PROJECT_MANAGER";
  });
}

export async function listProjects(
  client: SupabaseClient,
  scope: RequestScope,
  filters: ProjectsQuery,
): Promise<ListProjectsResult> {
  return listProjectsScoped(client, scope, filters);
}

/**
 * Creates one project in the caller's organization.
 * Returns 201-shaped `{ ok: true, data }` on success.
 */
export async function createProject(
  client: SupabaseClient,
  scope: RequestScope,
  input: ProjectCreateInput,
): Promise<MutationResult<ProjectRow>> {
  const staff = staffOrgIds(scope);

  let organizationId: string;
  if (input.organizationIdHint !== undefined) {
    if (!staff.includes(input.organizationIdHint)) {
      return forbidden();
    }
    organizationId = input.organizationIdHint;
  } else {
    if (staff.length === 0) {
      return forbidden();
    }
    organizationId = [...staff].sort()[0] as string;
  }

  let code = input.code;
  if (code === undefined) {
    code = await generateProjectCode(client, organizationId, input.name);
  } else if (await isProjectCodeTaken(client, organizationId, code)) {
    return {
      ok: false,
      failure: {
        code: "VALIDATION_ERROR",
        message: "Project code is already in use in this organization",
        details: [
          { field: "code", message: "code must be unique within the organization" },
        ],
      },
    };
  }

  if (typeof input.managerId === "string") {
    const member = await isUserOrgMember(client, input.managerId, organizationId);
    if (!member) {
      return {
        ok: false,
        failure: {
          code: "VALIDATION_ERROR",
          message: "Project manager must be a member of the organization",
          details: [
            {
              field: "managerId",
              message: "managerId must reference a member of the organization",
            },
          ],
        },
      };
    }
  }

  try {
    const created = await insertProject(client, {
      organization_id: organizationId,
      name: input.name,
      code,
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.client !== undefined ? { client: input.client } : {}),
      ...(input.managerId !== undefined ? { manager_id: input.managerId } : {}),
      ...(input.method !== undefined ? { method: input.method } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.progress !== undefined ? { progress: input.progress } : {}),
      ...(input.startDate !== undefined ? { start_date: input.startDate } : {}),
      ...(input.endDate !== undefined ? { end_date: input.endDate } : {}),
      ...(input.budgetTotal !== undefined
        ? { budget_total: input.budgetTotal }
        : {}),
      ...(input.budgetCurrency !== undefined
        ? { budget_currency: input.budgetCurrency }
        : {}),
    });
    return { ok: true, data: created };
  } catch (error) {
    if (error instanceof DbWriteError) {
      if (error.kind === "unique_violation") {
        return {
          ok: false,
          failure: {
            code: "VALIDATION_ERROR",
            message: "Project code is already in use in this organization",
            details: [
              {
                field: "code",
                message: "code must be unique within the organization",
              },
            ],
          },
        };
      }
      if (error.kind === "rls_denied") {
        return forbidden();
      }
      if (error.kind === "foreign_key") {
        return invalid("Referenced user does not exist");
      }
    }
    throw error;
  }
}

/**
 * Updates one accessible project. Organization transfer is rejected;
 * membership changes are out of scope (no member fields are read).
 */
export async function updateProject(
  client: SupabaseClient,
  scope: RequestScope,
  projectId: string,
  input: ProjectUpdateInput,
): Promise<MutationResult<ProjectRow>> {
  if (input.organizationIdAttempt !== undefined) {
    return forbidden("Project organization cannot be changed");
  }

  const accessible = await findAccessibleProjectById(client, scope, projectId);
  if (!accessible) {
    return notFound();
  }
  const role = scope.rolesByOrg[accessible.organization_id];
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") {
    return forbidden();
  }

  const patch: {
    name?: string;
    code?: string;
    description?: string | null;
    client?: string | null;
    manager_id?: string | null;
    method?: string;
    status?: string;
    priority?: string;
    progress?: number;
    start_date?: string | null;
    end_date?: string | null;
    budget_total?: string | null;
    budget_currency?: string;
  } = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.code !== undefined) patch.code = input.code;
  if (input.description !== undefined) patch.description = input.description;
  if (input.client !== undefined) patch.client = input.client;
  if (input.managerId !== undefined) patch.manager_id = input.managerId;
  if (input.method !== undefined) patch.method = input.method;
  if (input.status !== undefined) patch.status = input.status;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.progress !== undefined) patch.progress = input.progress;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.budgetTotal !== undefined) patch.budget_total = input.budgetTotal;
  if (input.budgetCurrency !== undefined)
    patch.budget_currency = input.budgetCurrency;

  if (Object.keys(patch).length === 0) {
    return invalid("Request body must include at least one editable field");
  }

  if (patch.code !== undefined) {
    const taken = await isProjectCodeTaken(
      client,
      accessible.organization_id,
      patch.code,
      projectId,
    );
    if (taken) {
      return {
        ok: false,
        failure: {
          code: "VALIDATION_ERROR",
          message: "Project code is already in use in this organization",
          details: [
            {
              field: "code",
              message: "code must be unique within the organization",
            },
          ],
        },
      };
    }
  }

  if (typeof patch.manager_id === "string") {
    const member = await isUserOrgMember(
      client,
      patch.manager_id,
      accessible.organization_id,
    );
    if (!member) {
      return {
        ok: false,
        failure: {
          code: "VALIDATION_ERROR",
          message: "Project manager must be a member of the organization",
          details: [
            {
              field: "managerId",
              message: "managerId must reference a member of the organization",
            },
          ],
        },
      };
    }
  }

  try {
    const updated = await updateProjectById(client, projectId, patch);
    if (!updated) {
      return notFound();
    }
    return { ok: true, data: updated };
  } catch (error) {
    if (error instanceof DbWriteError) {
      if (error.kind === "unique_violation") {
        return {
          ok: false,
          failure: {
            code: "VALIDATION_ERROR",
            message: "Project code is already in use in this organization",
            details: [
              {
                field: "code",
                message: "code must be unique within the organization",
              },
            ],
          },
        };
      }
      if (error.kind === "rls_denied") {
        return forbidden();
      }
      if (error.kind === "foreign_key") {
        return invalid("Referenced user does not exist");
      }
    }
    throw error;
  }
}
