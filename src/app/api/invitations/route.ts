import { type NextRequest } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { isAppRole } from "@/types/api";
import {
  forbiddenResponse,
  internalErrorResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { db } from "@/db";
import { invitations, activityLogs } from "@supabase/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/invitations — list organization invitations.
 * Matrix: ADMIN + HR manage invitations (PM read retained for planning
 * visibility; DEVELOPER / FINANCE / LEGAL are denied).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    const role = scope.primaryRole;
    if (role !== "ADMIN" && role !== "HR" && role !== "PROJECT_MANAGER") {
      return forbiddenResponse();
    }

    const orgId = scope.primaryOrganizationId;
    if (!orgId) return forbiddenResponse();

    const items = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(eq(invitations.organizationId, orgId))
      .orderBy(desc(invitations.createdAt))
      .limit(50);

    return successResponse(items);
  } catch (err) {
    console.error("GET /api/invitations error:", err);
    return internalErrorResponse();
  }
}

/**
 * POST /api/invitations — invite a member.
 * Matrix (Invite members): ADMIN + HR only. PM/DEV/FINANCE/LEGAL are
 * denied. Any of the six roles may be invited; the invitee accepts
 * through the trusted accept lane.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    const orgId = scope.primaryOrganizationId;
    if (!orgId) return forbiddenResponse();

    // Caller role in the target organization (server-derived, never trusted
    // from the client).
    const callerRole = scope.rolesByOrg[orgId];
    if (callerRole !== "ADMIN" && callerRole !== "HR") {
      return forbiddenResponse();
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return validationErrorResponse([
        { field: "body", message: "Request body must be a JSON object" },
      ]);
    }

    const email =
      typeof (body as { email?: unknown }).email === "string"
        ? ((body as { email: string }).email.trim().toLowerCase())
        : "";
    const requestedRole = (body as { role?: unknown }).role;

    if (!email || !email.includes("@")) {
      return validationErrorResponse([
        { field: "email", message: "A valid email is required" },
      ]);
    }
    if (!isAppRole(requestedRole)) {
      return validationErrorResponse([
        { field: "role", message: "role must be a valid application role" },
      ]);
    }

    // 7-day expiration
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const [created] = await db
      .insert(invitations)
      .values({
        organizationId: orgId,
        email,
        role: requestedRole,
        status: "pending",
        invitedBy: user.id,
        expiresAt,
      })
      .returning();

    // Log activity
    await db.insert(activityLogs).values({
      organizationId: orgId,
      userId: user.id,
      action: "created",
      entityType: "team",
      entityId: created.id,
      value: `Invited ${email} as ${requestedRole}`,
    });

    const inviteUrl = `/auth/invite?token=${created.id}`;

    return successResponse({
      ...created,
      inviteUrl,
    });
  } catch (err) {
    console.error("POST /api/invitations error:", err);
    return internalErrorResponse();
  }
}
