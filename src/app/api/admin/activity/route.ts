import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { db } from "@/db";
import { activityLogs, users } from "@supabase/schema";
import { eq, desc } from "drizzle-orm";
import { forbiddenResponse, internalErrorResponse, successResponse } from "@/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    if (scope.primaryRole !== "ADMIN") {
      return forbiddenResponse();
    }

    const orgId = scope.primaryOrganizationId;
    if (!orgId) return forbiddenResponse();

    const items = await db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        value: activityLogs.value,
        entityType: activityLogs.entityType,
        createdAt: activityLogs.createdAt,
        userEmail: users.email,
        userName: users.firstName,
      })
      .from(activityLogs)
      .leftJoin(users, eq(users.id, activityLogs.userId))
      .where(eq(activityLogs.organizationId, orgId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(100);

    return successResponse(items);
  } catch (err) {
    console.error("GET /api/admin/activity error:", err);
    return internalErrorResponse();
  }
}
