import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/api/auth";
import { parsePagination } from "@/api/pagination";
import {
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import {
  validateMarkReadBody,
  validateNotificationQuery,
} from "@/schemas/notification-query";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/repositories/notification.repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications — the authenticated caller's own inbox only.
 *
 * Privacy: the owner is always the session subject. No `userId`/`user_id`
 * query parameter is read, so knowing another user's ID can never expose
 * their notifications (RLS `notifications_select_own` restricts rows to
 * `user_id = auth.uid()` even for ADMINs). Always paginated
 * (`?page=1&pageSize=20`, pageSize clamped to 100).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) {
      return auth.response;
    }
    const { user, supabase } = auth.context;

    const searchParams = request.nextUrl.searchParams;

    const pagination = parsePagination(searchParams);
    if ("response" in pagination) {
      return pagination.response;
    }

    const validated = validateNotificationQuery(searchParams);
    if ("response" in validated) {
      return validated.response;
    }
    const { filters } = validated;

    const result = await listNotifications(supabase, user.id, {
      type: filters.type,
      read: filters.read,
      priority: filters.priority,
      search: filters.search,
      page: pagination.params.page,
      pageSize: pagination.params.pageSize,
    });
    const unreadCount = await getUnreadNotificationCount(supabase, user.id);

    return successResponse(result.items, {
      pagination: result.pagination,
      meta: { unreadCount },
    });
  } catch (error) {
    console.error("GET /api/notifications failed:", error);
    return internalErrorResponse();
  }
}

/**
 * PATCH /api/notifications — mark owned notifications read.
 *
 * Body: `{ "id": "<uuid>", "read"?: boolean }` flips one owned row, or
 * `{ "markAllRead": true }` marks the caller's inbox read. Ownership comes
 * from the session only: updates are constrained to
 * `id + user_id = caller` under RLS `notifications_update_own`, so a caller
 * of any role (including DEVELOPER) can only mutate their own rows. Unknown
 * IDs and other users' IDs both answer 404 NOT_FOUND. Only the `read` flag
 * is ever written — no other notification fields, no user reassignment.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) {
      return auth.response;
    }
    const { user, supabase } = auth.context;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return validationErrorResponse([
        { field: "body", message: "Request body must be valid JSON" },
      ]);
    }

    const validated = validateMarkReadBody(body);
    if ("response" in validated) {
      return validated.response;
    }

    if (validated.request.kind === "all") {
      const updated = await markAllNotificationsRead(supabase, user.id);
      return successResponse({ updated });
    }

    const row = await markNotificationRead(
      supabase,
      user.id,
      validated.request.id,
      validated.request.read,
    );
    if (!row) {
      return notFoundResponse("Notification not found");
    }
    return successResponse(row);
  } catch (error) {
    console.error("PATCH /api/notifications failed:", error);
    return internalErrorResponse();
  }
}
