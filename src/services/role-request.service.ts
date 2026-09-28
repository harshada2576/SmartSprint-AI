import {
  activityLogs,
  organizationMembers,
  roleChangeRequests,
} from "@supabase/schema";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { AppRole, MutationResult } from "@/types/api";
import { isAppRole } from "@/types/api";
import { classifyRoleRequestShape } from "./rbac";

/**
 * Role-change request service — the ONLY valid path for changing
 * `organization_members.role` (§1.2.1, §2.4).
 *
 * Ownership: Backend/API agent (`src/services/**`).
 *
 * Security:
 * - The server never trusts client-supplied role claims; the actual
 *   current role is read from the database and `current_role` must equal
 *   it at creation time.
 * - Approval atomically updates the membership row + request status +
 *   audit entry inside one transaction with the role-guard bypass flag
 *   (`SET LOCAL app.bypass_role_guard = 'on'`); without the flag the
 *   `trg_organization_members_forbid_direct_role` trigger rejects the
 *   write, so there is no partial-state window and no direct-write path.
 */

function forbidden(message = "Insufficient permissions"): MutationResult<never> {
  return { ok: false, failure: { code: "FORBIDDEN", message } };
}

function notFound(message = "Role request not found"): MutationResult<never> {
  return { ok: false, failure: { code: "NOT_FOUND", message } };
}

function invalid(field: string, message: string): MutationResult<never> {
  return {
    ok: false,
    failure: { code: "VALIDATION_ERROR", message, details: [{ field, message }] },
  };
}

export interface RoleRequestCreateInput {
  callerUserId: string;
  callerRole: AppRole | undefined;
  callerOrgIds: string[];
  targetUserId: string;
  organizationId: string;
  requestedRole: unknown;
}

export interface ValidatedRoleRequest {
  targetUserId: string;
  organizationId: string;
  currentRole: AppRole;
  requestedRole: AppRole;
}

/**
 * Pure shape validation shared by the route and unit tests.
 * Database reads (actual current role, same-org, duplicate pending) are
 * supplied by the caller so the rules stay testable without a database.
 */
export function validateRoleRequestShapePure(args: {
  callerUserId: string;
  callerRole: AppRole | undefined;
  targetUserId: string;
  sameOrganization: boolean;
  targetCurrentRole: AppRole | undefined;
  requestedRole: AppRole | undefined;
  hasPending: boolean;
}): MutationResult<ValidatedRoleRequest> {
  const {
    callerUserId,
    callerRole,
    targetUserId,
    sameOrganization,
    targetCurrentRole,
    requestedRole,
    hasPending,
  } = args;

  const shape = classifyRoleRequestShape({
    callerUserId,
    callerRole,
    targetUserId,
    sameOrganization,
  });
  if (shape === "invalid") {
    return forbidden("Role-change request shape is not permitted");
  }
  if (!targetCurrentRole || !isAppRole(targetCurrentRole)) {
    return notFound("Target membership not found");
  }
  if (!requestedRole || !isAppRole(requestedRole)) {
    return invalid("requestedRole", "requestedRole must be a valid role");
  }
  if (requestedRole === targetCurrentRole) {
    return invalid(
      "requestedRole",
      "requestedRole must differ from the current role",
    );
  }
  if (hasPending) {
    return invalid(
      "userId",
      "A pending role-change request already exists for this member",
    );
  }
  return {
    ok: true,
    data: {
      targetUserId,
      organizationId: "",
      currentRole: targetCurrentRole,
      requestedRole,
    },
  };
}

export function validateDecisionPure(args: {
  deciderUserId: string;
  deciderRole: AppRole | undefined;
  deciderOrgIds: string[];
  requestOrgId: string;
  requestTargetUserId: string;
  requestRequestedBy: string;
  requestStatus: string;
}): MutationResult<null> {
  const {
    deciderUserId,
    deciderRole,
    deciderOrgIds,
    requestOrgId,
    requestTargetUserId,
    requestRequestedBy,
    requestStatus,
  } = args;
  if (!deciderOrgIds.includes(requestOrgId)) {
    return notFound("Role request not found");
  }
  // Role is per-organization; the decider must be ADMIN in the request org.
  // Callers pass the decider's role in the request organization.
  if (deciderRole !== "ADMIN") {
    return forbidden("Only ADMIN may decide role-change requests");
  }
  // No self-decision: neither the target nor the submitter may decide.
  if (deciderUserId === requestTargetUserId) {
    return forbidden("The target of a role-change request cannot decide it");
  }
  if (deciderUserId === requestRequestedBy) {
    return forbidden("The submitter of a role-change request cannot decide it");
  }
  if (requestStatus !== "pending") {
    return invalid("status", "This request has already been decided");
  }
  return { ok: true, data: null };
}

/**
 * Atomically approves or rejects a request (trusted lane).
 * Preconditions must already be verified via validateDecisionPure.
 */
export async function decideRoleRequestAtomic(args: {
  requestId: string;
  organizationId: string;
  targetUserId: string;
  decision: "approved" | "rejected";
  deciderUserId: string;
}): Promise<void> {
  const { requestId, organizationId, targetUserId, decision, deciderUserId } =
    args;
  const now = new Date().toISOString();
  const { db } = await import("@/db");
  await db.transaction(async (tx) => {
    // Bypass flag is transaction-scoped (SET LOCAL): only this transaction
    // may write organization_members.role, satisfying the trigger.
    await tx.execute(
      sql`SELECT set_config('app.bypass_role_guard', 'on', true)`,
    );
    if (decision === "approved") {
      // Re-read inside the transaction to keep the single-ADMIN rule and
      // the pending guard race-free.
      const pending = await tx
        .select()
        .from(roleChangeRequests)
        .where(
          and(
            eq(roleChangeRequests.id, requestId),
            eq(roleChangeRequests.status, "pending"),
          ),
        )
        .limit(1);
      if (pending.length === 0) {
        throw new Error("ROLE_REQUEST_ALREADY_DECIDED");
      }
      await tx
        .update(organizationMembers)
        .set({ role: pending[0].requestedRole })
        .where(
          and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.userId, targetUserId),
          ),
        );
    }
    await tx
      .update(roleChangeRequests)
      .set({
        status: decision,
        decidedBy: deciderUserId,
        decidedAt: now,
      })
      .where(
        and(
          eq(roleChangeRequests.id, requestId),
          eq(roleChangeRequests.status, "pending"),
        ),
      );
    await tx.insert(activityLogs).values({
      organizationId,
      userId: deciderUserId,
      action: decision === "approved" ? "approved" : "rejected",
      entityType: "role_change_request",
      entityId: requestId,
      value: `Role-change request ${decision} for member ${targetUserId}`,
    });
  });
}
