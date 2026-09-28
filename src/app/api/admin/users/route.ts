import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { db } from "@/db";
import { users, organizationMembers, organizations } from "@supabase/schema";
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

    const members = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        jobTitle: users.jobTitle,
        department: users.department,
        status: users.status,
        role: organizationMembers.role,
        joinedAt: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, orgId))
      .orderBy(desc(organizationMembers.createdAt));

    return successResponse(members);
  } catch (err) {
    console.error("GET /api/admin/users error:", err);
    return internalErrorResponse();
  }
}
