import type { NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { isAppRole, type AppRole } from "@/types/api";
import { classifyRoleRequestShape } from "@/services/rbac";
import {
  createdResponse,
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
 * POST /api/role-requests — create a role-change request (§2.4).
 *
 * Exactly two valid shapes (server-verified, never trusted from client):
 * - self-request: requested_by = user_id, caller role != HR.
 * - HR-on-behalf: caller is HR in the same org, target differs.
 * Rejects ADMIN/PM/DEV/FINANCE/LEGAL on-behalf, HR self-requests, and
 * cross-organization requests with 403. Duplicate pending requests are
 * rejected with 400.
 */
export async function POST(request: NextRequest) {
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
    const organizationId =
      typeof body.organizationId === "string"
        ? body.organizationId.trim()
        : "";
    const requestedRoleRaw = body.requestedRole;

    if (!isUuid(targetUserId)) {
      return validationErrorResponse([
        { field: "userId", message: "userId must be a valid UUID" },
      ]);
    }
    if (!isUuid(organizationId)) {
      return validationErrorResponse([
        {
          field: "organizationId",
          message: "organizationId must be a valid UUID",
        },
      ]);
    }
    if (!isAppRole(requestedRoleRaw)) {
      return validationErrorResponse([
        { field: "requestedRole", message: "requestedRole must be a valid role" },
      ]);
    }
    const requestedRole = requestedRoleRaw as AppRole;

    // Caller membership in the target org (actual role from the database).
    const { data: callerRows, error: callerError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .limit(1);
    if (callerError) throw callerError;
    const callerRow = Array.isArray(callerRows) ? callerRows[0] : null;
    if (!callerRow || !isAppRole((callerRow as { role: unknown }).role)) {
      return notFoundResponse("Organization membership not found");
    }
    const callerRole = (callerRow as { role: AppRole }).role;

    // Target membership in the same org (actual current role from DB).
    const { data: targetRows, error: targetError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", targetUserId)
      .limit(1);
    if (targetError) throw targetError;
    const targetRow = Array.isArray(targetRows) ? targetRows[0] : null;
    if (!targetRow || !isAppRole((targetRow as { role: unknown }).role)) {
      return notFoundResponse("Target membership not found");
    }
    const currentRole = (targetRow as { role: AppRole }).role;

    // Exact shape validation (§2.4).
    const shape = classifyRoleRequestShape({
      callerUserId: user.id,
      callerRole,
      targetUserId,
      sameOrganization: true,
    });
    if (shape === "invalid") {
      return forbiddenResponse(
        "Role-change request shape is not permitted",
      );
    }
    if (requestedRole === currentRole) {
      return validationErrorResponse([
        {
          field: "requestedRole",
          message: "requestedRole must differ from the current role",
        },
      ]);
    }

    // Duplicate pending guard.
    const { data: pending, error: pendingError } = await supabase
      .from("role_change_requests")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("status", "pending")
      .limit(1);
    if (pendingError) throw pendingError;
    if (Array.isArray(pending) && pending.length > 0) {
      return validationErrorResponse([
        {
          field: "userId",
          message:
            "A pending role-change request already exists for this member",
        },
      ]);
    }

    // Insert through the RLS-enforcing client (INSERT policy re-checks the
    // two-shape rule at the database layer).
    const { data: created, error: insertError } = await supabase
      .from("role_change_requests")
      .insert({
        user_id: targetUserId,
        organization_id: organizationId,
        current_role: currentRole,
        requested_role: requestedRole,
        requested_by: user.id,
      })
      .select("id,user_id,organization_id,current_role,requested_role,status,requested_by,created_at")
      .single();
    if (insertError) {
      const message = String(
        (insertError as { message?: string }).message ?? "",
      ).toLowerCase();
      if (
        message.includes("row-level security") ||
        message.includes("policy") ||
        (insertError as { code?: string }).code === "42501"
      ) {
        return forbiddenResponse(
          "Role-change request shape is not permitted",
        );
      }
      if (message.includes("duplicate") || message.includes("unique")) {
        return validationErrorResponse([
          {
            field: "userId",
            message:
              "A pending role-change request already exists for this member",
          },
        ]);
      }
      throw insertError;
    }

    return createdResponse(created);
  } catch (error) {
    console.error("POST /api/role-requests failed:", error);
    return internalErrorResponse();
  }
}

/**
 * GET /api/role-requests — list requests visible to the caller:
 * target user, HR requester, or ADMIN of the organization.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    if (scope.organizationIds.length === 0) {
      return successResponse([]);
    }

    const status = request.nextUrl.searchParams.get("status");
    const organizationId = request.nextUrl.searchParams.get("organizationId");

    let query = supabase
      .from("role_change_requests")
      .select(
        "id,user_id,organization_id,current_role,requested_role,status,requested_by,decided_by,decided_at,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (
      status === "pending" ||
      status === "approved" ||
      status === "rejected"
    ) {
      query = query.eq("status", status);
    }
    if (organizationId && isUuid(organizationId)) {
      if (!scope.organizationIds.includes(organizationId)) {
        return successResponse([]);
      }
      query = query.eq("organization_id", organizationId);
    } else {
      query = query.in("organization_id", scope.organizationIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return successResponse(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error("GET /api/role-requests failed:", error);
    return internalErrorResponse();
  }
}
