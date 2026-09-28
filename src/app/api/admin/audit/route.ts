import type { NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { db } from "@/db";
import { activityLogs, users } from "@supabase/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  forbiddenResponse,
  internalErrorResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { isUuid } from "@/schemas/query-params";

export const dynamic = "force-dynamic";

const ACTIONS = new Set([
  "created",
  "updated",
  "deleted",
  "approved",
  "rejected",
  "completed",
  "assigned",
  "commented",
]);

/**
 * GET /api/admin/audit — dedicated audit API over activity_logs
 * (ADMIN only). Filters: ?organizationId=&action=&from=&to=&limit=.
 * Replaces reliance on /api/dashboard/stats.recentAudit.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    if (scope.primaryRole !== "ADMIN") {
      return forbiddenResponse();
    }

    const params = request.nextUrl.searchParams;
    const organizationId =
      params.get("organizationId")?.trim() || scope.primaryOrganizationId;
    if (!organizationId || !isUuid(organizationId)) {
      return validationErrorResponse([
        { field: "organizationId", message: "organizationId is required" },
      ]);
    }
    if (!scope.organizationIds.includes(organizationId)) {
      return forbiddenResponse();
    }

    const action = params.get("action")?.trim() ?? "";
    if (action && !ACTIONS.has(action)) {
      return validationErrorResponse([
        { field: "action", message: "action is not a known audit action" },
      ]);
    }
    const from = params.get("from")?.trim() ?? "";
    const to = params.get("to")?.trim() ?? "";
    const limitRaw = Number(params.get("limit") ?? 100);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(500, Math.round(limitRaw)))
      : 100;

    const conditions = [eq(activityLogs.organizationId, organizationId)];
    if (action) {
      conditions.push(eq(activityLogs.action, action as never));
    }
    if (from && !Number.isNaN(Date.parse(from))) {
      conditions.push(gte(activityLogs.createdAt, new Date(from).toISOString()));
    }
    if (to && !Number.isNaN(Date.parse(to))) {
      conditions.push(lte(activityLogs.createdAt, new Date(to).toISOString()));
    }

    const items = await db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        value: activityLogs.value,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        projectId: activityLogs.projectId,
        createdAt: activityLogs.createdAt,
        userEmail: users.email,
        userName: users.firstName,
      })
      .from(activityLogs)
      .leftJoin(users, eq(users.id, activityLogs.userId))
      .where(and(...conditions))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);

    return successResponse(items);
  } catch (error) {
    console.error("GET /api/admin/audit failed:", error);
    return internalErrorResponse();
  }
}
