import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { MutationResult } from "@/types/api";
import type { SprintsQuery } from "@/schemas/list-queries";
import type {
  SprintCreateInput,
  SprintUpdateInput,
} from "@/schemas/sprint-mutations";
import {
  listSprintsScoped,
  type ListSprintsResult,
  type SprintRow,
  findSprintRowById,
  insertSprint,
  updateSprintById,
} from "@/repositories/sprint.repository";
import {
  findAccessibleProjectById,
  findProjectRowById,
} from "@/repositories/project.repository";
import { DbWriteError } from "@/repositories/mutation-helpers";

/**
 * Sprint service — business-logic seam between API routes and repositories.
 *
 * Ownership: Backend/API agent (`src/services/**`).
 *
 * Read contract (unchanged): `null` propagates the "scoped project not
 * accessible" signal so the route returns 404 without leaking existence.
 *
 * Write authorization (server-derived `RequestScope` only — never request
 * claims):
 * - Create/update: ADMIN or PROJECT_MANAGER in the sprint's project
 *   organization. DEVELOPER has no sprint write path (RLS provides no
 *   `sprints_insert_*` / `sprints_update_*` policy for developers) →
 *   FORBIDDEN.
 * - The organization is derived server-side from the project; a body
 *   `organizationId` is never trusted (org transfer → 403).
 * - Sprints never move projects: a body `projectId` on PATCH → 400.
 */

function forbidden(message = "Insufficient permissions"): MutationResult<never> {
  return { ok: false, failure: { code: "FORBIDDEN", message } };
}

function notFound(message = "Sprint not found"): MutationResult<never> {
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

export async function listSprints(
  client: SupabaseClient,
  scope: RequestScope,
  filters: SprintsQuery,
): Promise<ListSprintsResult | null> {
  return listSprintsScoped(client, scope, filters);
}

/**
 * Creates one sprint in an accessible project. The organization is derived
 * server-side from the project (no `organizationId` is read from the body).
 */
export async function createSprint(
  client: SupabaseClient,
  scope: RequestScope,
  input: SprintCreateInput,
): Promise<MutationResult<SprintRow>> {
  const project = await findProjectRowById(client, input.projectId);
  if (!project) {
    return { ok: false, failure: { code: "NOT_FOUND", message: "Project not found" } };
  }
  if (!isStaffRole(scope.rolesByOrg[project.organization_id])) {
    return forbidden();
  }

  try {
    const created = await insertSprint(client, {
      project_id: project.id,
      name: input.name,
      ...(input.goal !== undefined ? { goal: input.goal } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.startDate !== undefined ? { start_date: input.startDate } : {}),
      ...(input.endDate !== undefined ? { end_date: input.endDate } : {}),
      ...(input.totalPoints !== undefined
        ? { total_points: input.totalPoints }
        : {}),
      ...(input.completedPoints !== undefined
        ? { completed_points: input.completedPoints }
        : {}),
    });
    return { ok: true, data: created };
  } catch (error) {
    if (error instanceof DbWriteError) {
      if (error.kind === "rls_denied") return forbidden();
      if (error.kind === "foreign_key") {
        return invalid("projectId", "Referenced record does not exist");
      }
      if (error.kind === "unique_violation") {
        return invalid("body", "Sprint could not be created");
      }
    }
    throw error;
  }
}

/**
 * Updates one accessible sprint. Project moves are rejected (400);
 * organization transfers are rejected (403); developers are denied (403).
 */
export async function updateSprint(
  client: SupabaseClient,
  scope: RequestScope,
  sprintId: string,
  input: SprintUpdateInput,
): Promise<MutationResult<SprintRow>> {
  if (input.organizationIdAttempt !== undefined) {
    return forbidden("Sprint organization cannot be changed");
  }
  if (input.projectIdAttempt !== undefined) {
    return invalid("projectId", "projectId cannot be changed");
  }

  const current = await findSprintRowById(client, sprintId);
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
  if (!isStaffRole(scope.rolesByOrg[project.organization_id])) {
    return forbidden();
  }

  const patch: {
    name?: string;
    goal?: string | null;
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
    total_points?: number | null;
    completed_points?: number | null;
  } = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.goal !== undefined) patch.goal = input.goal;
  if (input.status !== undefined) patch.status = input.status;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.totalPoints !== undefined) patch.total_points = input.totalPoints;
  if (input.completedPoints !== undefined)
    patch.completed_points = input.completedPoints;

  if (Object.keys(patch).length === 0) {
    return invalid("body", "Request body must include at least one editable field");
  }

  // Partial date updates still merge against the stored row so an inverted
  // range is rejected even when only one side changes.
  const effectiveStart =
    patch.start_date !== undefined ? patch.start_date : current.start_date;
  const effectiveEnd =
    patch.end_date !== undefined ? patch.end_date : current.end_date;
  if (
    typeof effectiveStart === "string" &&
    typeof effectiveEnd === "string" &&
    effectiveEnd < effectiveStart
  ) {
    return invalid("endDate", 'Field "endDate" must be on or after "startDate"');
  }

  try {
    const updated = await updateSprintById(client, sprintId, patch);
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
        return invalid("body", "Sprint could not be updated");
      }
    }
    throw error;
  }
}
