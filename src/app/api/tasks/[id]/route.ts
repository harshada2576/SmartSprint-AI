import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseTaskUpdateBody } from "@/schemas/task-mutations";
import { getTaskById, updateTask } from "@/services/task.service";
import { db } from "@/db";
import { notifications, organizationMembers, projects } from "@supabase/schema";
import { eq, inArray } from "drizzle-orm";
import { isUuid } from "@/schemas/query-params";
import {
  internalErrorResponse,
  mutationFailureResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tasks/:id — one accessible task.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Scope: derived server-side from `organization_members` (never from
 * browser-supplied org/role/user claims); the task's project must be
 * accessible to the caller (RLS + explicit check). Missing and inaccessible
 * rows share the same 404 (no existence oracle). Read-only: developers may
 * READ any accessible task — the developer mutation restriction
 * (self-assigned only, no reassignment) applies to PATCH, never to GET, and
 * no `assignee=me` filter is required.
 * Returns the full task row (same shape as the collection endpoint,
 * compatible with the frontend task normalization).
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("GET /api/tasks/:id auth failed:", error);
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
    console.error("GET /api/tasks/:id scope failed:", error);
    return internalErrorResponse();
  }

  try {
    const row = await getTaskById(authContext.supabase, scope, id);
    if (!row) {
      return notFoundResponse("Task not found");
    }
    return successResponse(row);
  } catch (error) {
    console.error("GET /api/tasks/:id failed:", error);
    return internalErrorResponse();
  }
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
    // PM-facing notification when a task becomes blocked with a reason.
    // Best-effort trusted-lane write (notifications have no client INSERT
    // policy); never fails the task update itself.
    if (parsed.value.isBlocked === true) {
      const projectId = (result.data as { project_id?: string }).project_id;
      const reason =
        typeof parsed.value.blockedReason === "string"
          ? parsed.value.blockedReason
          : null;
      if (projectId) {
        notifyProjectStaffOfBlockedTask(
          projectId,
          (result.data as { title?: string }).title ?? "Task",
          id,
          reason,
        ).catch((err) =>
          console.error("Blocked-task notification failed:", err),
        );
      }
    }
    return successResponse(result.data);
  } catch (error) {
    console.error("PATCH /api/tasks/:id failed:", error);
    return internalErrorResponse();
  }

/**
 * Inserts a task-blocked notification for every ADMIN / PROJECT_MANAGER of
 * the task's organization (trusted lane). HR, FINANCE, LEGAL, and
 * DEVELOPER callers all trigger the same PM-facing alert.
 */
async function notifyProjectStaffOfBlockedTask(
  projectId: string,
  taskTitle: string,
  taskId: string,
  reason: string | null,
): Promise<void> {
  const [project] = await db
    .select({ organizationId: projects.organizationId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return;
  const staff = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, project.organizationId));
  const staffIds = Array.from(
    new Set(
      staff
        .map((r) => r.userId)
        .filter((v): v is string => typeof v === "string"),
    ),
  );
  if (staffIds.length === 0) return;
  // Only ADMIN / PROJECT_MANAGER members are notified; role check via a
  // second filtered query keeps this lane small and explicit.
  const elevated = await db
    .select({
      userId: organizationMembers.userId,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .where(
      inArray(
        organizationMembers.userId,
        staffIds as [string, ...string[]],
      ),
    );
  const targets = elevated.filter(
    (r) => r.role === "ADMIN" || r.role === "PROJECT_MANAGER",
  );
  for (const t of targets) {
    await db.insert(notifications).values({
      userId: t.userId,
      type: "task",
      title: `Task blocked: ${taskTitle}`,
      description: reason
        ? `Blocked: ${reason}`
        : "A task in your project was marked as blocked.",
      priority: "high",
    });
  }
}
}
