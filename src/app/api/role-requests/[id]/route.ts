import type { NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import {
  decideRoleRequestAtomic,
  validateDecisionPure,
} from "@/services/role-request.service";
import {
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { isUuid } from "@/schemas/query-params";
import type { AppRole } from "@/types/api";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * PATCH /api/role-requests/[id] — ADMIN-only decision (§2.4).
 *
 * Body: `{ "decision": "approved" | "rejected" }`.
 * Rejects self-decision (target or submitter), wrong organization,
 * non-ADMIN callers, and already-decided requests. Approval atomically
 * updates the membership role + request status and writes an
 * `activity_logs` audit entry (no partial-state window).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id: requestId } = await context.params;
    if (!isUuid(requestId)) {
      return validationErrorResponse([
        { field: "id", message: "Role request id must be a valid UUID" },
      ]);
    }

    const body = await request.json().catch(() => null);
    const decision =
      isRecord(body) && typeof body.decision === "string"
        ? body.decision.trim().toLowerCase()
        : "";
    if (decision !== "approved" && decision !== "rejected") {
      return validationErrorResponse([
        {
          field: "decision",
          message: 'decision must be "approved" or "rejected"',
        },
      ]);
    }

    const scope = await resolveRequestScope(supabase, user.id);

    // Load the request through the RLS-enforcing client (SELECT policy
    // limits visibility to target / requester / org ADMIN).
    const { data: rows, error } = await supabase
      .from("role_change_requests")
      .select(
        "id,user_id,organization_id,current_role,requested_role,status,requested_by,decided_by",
      )
      .eq("id", requestId)
      .limit(1);
    if (error) throw error;
    const row = (Array.isArray(rows) ? rows[0] : null) as {
      id: string;
      user_id: string;
      organization_id: string;
      current_role: string;
      requested_role: string;
      status: string;
      requested_by: string;
    } | null;
    if (!row) {
      return notFoundResponse("Role request not found");
    }

    const deciderRole = scope.rolesByOrg[row.organization_id] as
      | AppRole
      | undefined;
    const verdict = validateDecisionPure({
      deciderUserId: user.id,
      deciderRole,
      deciderOrgIds: scope.organizationIds,
      requestOrgId: row.organization_id,
      requestTargetUserId: row.user_id,
      requestRequestedBy: row.requested_by,
      requestStatus: row.status,
    });
    if (!verdict.ok) {
      const { code, message, details } = verdict.failure;
      if (code === "FORBIDDEN") return forbiddenResponse(message);
      if (code === "NOT_FOUND") return notFoundResponse(message);
      return validationErrorResponse(
        details ?? [{ field: "status", message }],
        message,
      );
    }

    try {
      await decideRoleRequestAtomic({
        requestId: row.id,
        organizationId: row.organization_id,
        targetUserId: row.user_id,
        decision,
        deciderUserId: user.id,
      });
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "ROLE_REQUEST_ALREADY_DECIDED"
      ) {
        return validationErrorResponse(
          [{ field: "status", message: "This request has already been decided" }],
          "This request has already been decided",
        );
      }
      throw err;
    }

    return successResponse({
      id: row.id,
      status: decision,
      decidedBy: user.id,
    });
  } catch (error) {
    console.error("PATCH /api/role-requests/[id] failed:", error);
    return internalErrorResponse();
  }
}
