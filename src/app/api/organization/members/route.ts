import type { NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import {
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { isUuid } from "@/schemas/query-params";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * GET /api/organization/members — organization directory for member
 * management (Matrix: ADMIN + HR).
 *
 * HR sees the permitted directory fields only (firstName, lastName, email,
 * department, jobTitle, avatarInitials + membership role). Project data is
 * never included here.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    const orgId =
      request.nextUrl.searchParams.get("organizationId")?.trim() ||
      scope.primaryOrganizationId;
    if (!orgId || !isUuid(orgId)) {
      return validationErrorResponse([
        { field: "organizationId", message: "organizationId is required" },
      ]);
    }
    const callerRole = scope.rolesByOrg[orgId];
    if (callerRole !== "ADMIN" && callerRole !== "HR") {
      return forbiddenResponse();
    }

    const { data, error } = await supabase
      .from("organization_members")
      .select("user_id,role,created_at")
      .eq("organization_id", orgId)
      .limit(200);
    if (error) throw error;
    const memberships = (Array.isArray(data) ? data : []) as Array<{
      user_id: string;
      role: string;
      created_at: string;
    }>;
    const userIds = memberships
      .map((m) => m.user_id)
      .filter((v): v is string => typeof v === "string");
    let profiles: Array<{
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      department: string | null;
      job_title: string | null;
      avatar_initials: string | null;
    }> = [];
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select(
          "id,first_name,last_name,email,department,job_title,avatar_initials",
        )
        .in("id", userIds)
        .limit(200);
      if (usersError) throw usersError;
      profiles = (Array.isArray(users) ? users : []) as typeof profiles;
    }
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return successResponse(
      memberships.map((m) => ({
        userId: m.user_id,
        role: m.role,
        joinedAt: m.created_at,
        profile: byId.get(m.user_id) ?? null,
      })),
    );
  } catch (error) {
    console.error("GET /api/organization/members failed:", error);
    return internalErrorResponse();
  }
}

/**
 * PATCH /api/organization/members — edit another member's department /
 * jobTitle (Matrix: HR may edit; ADMIN may edit). HR cannot target itself
 * here for role changes (roles never change via this endpoint), and HR
 * profile writes are limited to department/jobTitle by RLS + trigger.
 *
 * Body: `{ "userId": "<uuid>", "organizationId"?: "<uuid>",
 *          "department"?: string | null, "jobTitle"?: string | null }`.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return validationErrorResponse([
        { field: "body", message: "Request body must be a JSON object" },
      ]);
    }
    const targetUserId =
      typeof body.userId === "string" ? body.userId.trim() : "";
    if (!isUuid(targetUserId)) {
      return validationErrorResponse([
        { field: "userId", message: "userId must be a valid UUID" },
      ]);
    }
    const orgId =
      (typeof body.organizationId === "string" && isUuid(body.organizationId)
        ? body.organizationId
        : scope.primaryOrganizationId) ?? "";
    if (!orgId) {
      return validationErrorResponse([
        { field: "organizationId", message: "organizationId is required" },
      ]);
    }
    const callerRole = scope.rolesByOrg[orgId];
    if (callerRole !== "ADMIN" && callerRole !== "HR") {
      return forbiddenResponse();
    }

    // Target must belong to the same organization.
    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("user_id", targetUserId)
      .limit(1)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) {
      return notFoundResponse("Member not found");
    }

    const patch: { department?: string | null; job_title?: string | null } = {};
    if (body.department !== undefined) {
      patch.department =
        body.department === null
          ? null
          : typeof body.department === "string"
            ? body.department.trim().slice(0, 120)
            : null;
    }
    if (body.jobTitle !== undefined) {
      patch.job_title =
        body.jobTitle === null
          ? null
          : typeof body.jobTitle === "string"
            ? body.jobTitle.trim().slice(0, 120)
            : null;
    }
    if (Object.keys(patch).length === 0) {
      return validationErrorResponse([
        {
          field: "body",
          message: "Provide department and/or jobTitle to update",
        },
      ]);
    }

    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update(patch)
      .eq("id", targetUserId)
      .select(
        "id,first_name,last_name,email,department,job_title,avatar_initials",
      )
      .single();
    if (updateError) {
      const code = (updateError as { code?: string }).code;
      if (code === "42501") return forbiddenResponse();
      throw updateError;
    }
    return successResponse(updated);
  } catch (error) {
    console.error("PATCH /api/organization/members failed:", error);
    return internalErrorResponse();
  }
}

/**
 * DELETE /api/organization/members — remove a member (Matrix: ADMIN + HR).
 * Body: `{ "userId": "<uuid>", "organizationId"?: "<uuid>" }`.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return validationErrorResponse([
        { field: "body", message: "Request body must be a JSON object" },
      ]);
    }
    const targetUserId =
      typeof body.userId === "string" ? body.userId.trim() : "";
    if (!isUuid(targetUserId)) {
      return validationErrorResponse([
        { field: "userId", message: "userId must be a valid UUID" },
      ]);
    }
    const orgId =
      (typeof body.organizationId === "string" && isUuid(body.organizationId)
        ? body.organizationId
        : scope.primaryOrganizationId) ?? "";
    if (!orgId) {
      return validationErrorResponse([
        { field: "organizationId", message: "organizationId is required" },
      ]);
    }
    const callerRole = scope.rolesByOrg[orgId];
    if (callerRole !== "ADMIN" && callerRole !== "HR") {
      return forbiddenResponse();
    }
    if (targetUserId === user.id) {
      return forbiddenResponse("Members cannot remove themselves");
    }

    const { data, error } = await supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", orgId)
      .eq("user_id", targetUserId)
      .select("user_id");
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "42501") return forbiddenResponse();
      throw error;
    }
    if (!Array.isArray(data) || data.length === 0) {
      return notFoundResponse("Member not found");
    }
    return successResponse({ userId: targetUserId, removed: true });
  } catch (error) {
    console.error("DELETE /api/organization/members failed:", error);
    return internalErrorResponse();
  }
}
