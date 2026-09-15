import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseTasksQuery } from "@/schemas/list-queries";
import { listTasks } from "@/services/task.service";
import {
  buildPaginationMeta,
  internalError,
  notFound,
  success,
  validationError,
} from "@/utils/api-response";

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
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("GET /api/tasks auth failed:", error);
    return internalError();
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
    return internalError();
  }

  const parsed = parseTasksQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return validationError(parsed.details);
  }

  try {
    const result = await listTasks(context.supabase, scope, parsed.value);
    if (result === null) {
      return notFound("Project not found");
    }
    return success(result.rows, buildPaginationMeta(parsed.value, result.total));
  } catch (error) {
    console.error("GET /api/tasks failed:", error);
    return internalError();
  }
}
