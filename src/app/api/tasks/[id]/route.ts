import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseTaskUpdateBody } from "@/schemas/task-mutations";
import { updateTask } from "@/services/task.service";
import { isUuid } from "@/schemas/query-params";
import {
  internalErrorResponse,
  mutationFailureResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/tasks/:id — edit an accessible task, including sprint-board
 * status advances.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Scope: missing and out-of-scope rows share the same 404 (no oracle).
 * Authorization:
 * - ADMIN / PROJECT_MANAGER of the owning org: full editable fields
 *   (title, description, priority, points, assignee, sprint, requirement,
 *   column status, due date). `assigneeId` must stay in-org;
 *   `sprintId`/`requirementId` must stay same-project (400 otherwise).
 * - DEVELOPER: only rows currently assigned to themselves, staying assigned
 *   to themselves. Any `assigneeId` in the body → 403 (no claiming
 *   unassigned tasks, no giving tasks away, no assigning peers); touching
 *   another developer's task → 403; `projectId`/`displayId` are immutable
 *   (400 on attempt) and `organizationId` moves → 403. Status changes on
 *   the caller's own task flow through the same path and succeed when the
 *   RLS `tasks_update_dev_self` policy permits them; RLS denials surface
 *   as 403, never 500.
 * `display_id` / `project_id` are never writable here.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("PATCH /api/tasks/:id auth failed:", error);
    return internalErrorResponse();
  }
  if (!auth.ok) {
    return auth.response;
  }
  const { context: authContext } = auth;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return validationErrorResponse([
      { field: "id", message: "Task id must be a valid UUID" },
    ]);
  }

  let scope;
  try {
    scope = await resolveRequestScope(authContext.supabase, authContext.user.id);
  } catch (error) {
    console.error("PATCH /api/tasks/:id scope failed:", error);
    return internalErrorResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse([
      { field: "body", message: "Request body must be valid JSON" },
    ]);
  }

  const parsed = parseTaskUpdateBody(body);
  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  try {
    const result = await updateTask(
      authContext.supabase,
      scope,
      id,
      parsed.value,
    );
    if (!result.ok) {
      return mutationFailureResponse(result.failure);
    }
    return successResponse(result.data);
  } catch (error) {
    console.error("PATCH /api/tasks/:id failed:", error);
    return internalErrorResponse();
  }
}
