import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseTasksQuery } from "@/schemas/list-queries";
import { parseTaskCreateBody } from "@/schemas/task-mutations";
import { createTask, listTasks } from "@/services/task.service";
import {
  createdResponse,
  internalErrorResponse,
  mutationFailureResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { buildPaginationMeta } from "@/api/pagination";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks — tasks in projects accessible to the authenticated caller.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Scope: `projectId` is verified server-side; an inaccessible project yields
 * 404 (missing and forbidden are indistinguishable — no existence oracle).
 * An inaccessible `sprintId` fails closed to an empty list.
 *
 * Developer boundary: the `assignee` filter only narrows rows RLS already
 * permits (`tasks_select_staff` / `tasks_select_member`) — it can never
 * broaden visibility, so a developer cannot use it to retrieve arbitrary
 * organization/project task data. There is intentionally no generic "claim
 * task" mutation on this route (task assignment stays ADMIN /
 * PROJECT_MANAGER via RLS; developer updates are pinned to self-assigned
 * rows by `tasks_update_dev_self`).
 *
 * Filters: `projectId`, `sprintId`, `status` (→ `column_status`), `assignee`,
 * `page`, `pageSize` (`limit` alias, max 100).
 *
 * Caller-scoped form: `?assignee=me` (or `?assignee_id=me`) filters to tasks
 * assigned to the authenticated caller. `me` is resolved server-side to the
 * verified `auth.uid()` (`context.user.id`); no client-supplied user ID,
 * organization ID, or role is ever trusted as identity authority. The query
 * still runs through the caller's RLS-enforcing Supabase client, so RLS
 * remains the constraining floor. Explicit UUID `assignee` filtering keeps
 * working unchanged (narrow-only under RLS).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("GET /api/tasks auth failed:", error);
    return internalErrorResponse();
  }
  if (!auth.ok) {
    return auth.response;
  }
  const { context } = auth;

  let scope;
  try {
    scope = await resolveRequestScope(context.supabase, context.user.id);
  } catch (error) {
    console.error("GET /api/tasks scope failed:", error);
    return internalErrorResponse();
  }

  const parsed = parseTasksQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  // Resolve `assignee=me` to the verified session subject. Authority is
  // `context.user.id` (from `supabase.auth.getUser()`, never the query
  // string); the sentinel flag is stripped so downstream layers only ever
  // see a concrete server-derived UUID.
  const { assigneeSelf: _assigneeSelf, ...baseFilters } = parsed.value;
  const filters = _assigneeSelf
    ? { ...baseFilters, assigneeId: context.user.id }
    : baseFilters;

  try {
    const result = await listTasks(context.supabase, scope, filters);
    if (result === null) {
      return notFoundResponse("Project not found");
    }
    return successResponse(result.rows, {
      pagination: buildPaginationMeta(parsed.value, result.total),
    });
  } catch (error) {
    console.error("GET /api/tasks failed:", error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/tasks — create a task in an accessible project.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Authorization: ADMIN / PROJECT_MANAGER of the owning organization only
 * (DEVELOPER → 403 — no INSERT policy). The project is verified server-side
 * through RLS; inaccessible projects share the same 404 (no oracle). No
 * `organizationId` is accepted — ownership is derived from the project.
 * `display_id` is server-generated (`TASK-NNN`, project-scoped unique);
 * client values are ignored. `assigneeId` must be an org member,
 * `sprintId`/`requirementId` must belong to the same project (400
 * otherwise).
 * Body: `projectId` + `title` required; `description`, `priority`
 * (high/medium/low), `points`, `assigneeId` (`assignee` alias),
 * `sprintId`, `requirementId`, `status`/`columnStatus`/`column_status`
 * (backlog/todo/inProgress/review/testing/done), `dueDate`/`due_date`
 * optional.
 * Returns 201 with the created row.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("POST /api/tasks auth failed:", error);
    return internalErrorResponse();
  }
  if (!auth.ok) {
    return auth.response;
  }
  const { context } = auth;

  let scope;
  try {
    scope = await resolveRequestScope(context.supabase, context.user.id);
  } catch (error) {
    console.error("POST /api/tasks scope failed:", error);
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

  const parsed = parseTaskCreateBody(body);
  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  try {
    const result = await createTask(
      context.supabase,
      scope,
      parsed.value,
    );
    if (!result.ok) {
      return mutationFailureResponse(result.failure);
    }
    return createdResponse(result.data);
  } catch (error) {
    console.error("POST /api/tasks failed:", error);
    return internalErrorResponse();
  }
}
