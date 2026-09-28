import type { NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import {
  isApprovalType,
  mayDecideApproval,
  mayEditBudgetContracts,
  mayEditMilestones,
  mayViewBudgetContracts,
  mayViewMilestones,
} from "@/services/rbac";
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

type GovernanceResource =
  | "budget"
  | "contracts"
  | "approvals"
  | "changes"
  | "milestones";

function parseResource(value: string | null): GovernanceResource | null {
  if (
    value === "budget" ||
    value === "contracts" ||
    value === "approvals" ||
    value === "changes" ||
    value === "milestones"
  ) {
    return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const TABLE: Record<GovernanceResource, string> = {
  budget: "budget_line_items",
  contracts: "contracts",
  approvals: "approvals",
  changes: "change_requests",
  milestones: "milestones",
};

async function loadRow(
  supabase: Parameters<typeof isProjectAccessible>[0],
  resource: GovernanceResource,
  id: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from(TABLE[resource])
    .select("*")
    .eq("id", id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * PATCH /api/governance/[id]?resource=X
 *
 * - budget/contracts/milestones: field edits under the matrix
 *   (budget/contracts: ADMIN/PM/FINANCE; milestones: ADMIN/PM/FINANCE).
 * - approvals: typed decision `{ "decision": "approved" | "rejected" }`
 *   under typed routing + no self-decision.
 * - changes: staff decision (ADMIN/PM) + no self-decision.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id } = await context.params;
    if (!isUuid(id)) {
      return validationErrorResponse([
        { field: "id", message: "id must be a valid UUID" },
      ]);
    }
    const resource = parseResource(request.nextUrl.searchParams.get("resource"));
    if (!resource) {
      return validationErrorResponse([
        {
          field: "resource",
          message:
            "resource must be budget, contracts, approvals, changes, or milestones",
        },
      ]);
    }

    const scope = await resolveRequestScope(supabase, user.id);
    const row = await loadRow(supabase, resource, id);
    if (!row || typeof row.project_id !== "string") {
      return notFoundResponse("Record not found");
    }
    const projectId = row.project_id;
    if (!(await isProjectAccessible(supabase, projectId))) {
      return notFoundResponse("Record not found");
    }
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id,organization_id")
      .eq("id", projectId)
      .limit(1)
      .maybeSingle();
    if (projectError) throw projectError;
    const orgId = (project as { organization_id?: string } | null)
      ?.organization_id;
    if (!orgId) return notFoundResponse("Record not found");
    const role = scope.rolesByOrg[orgId] as AppRole | undefined;

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return validationErrorResponse([
        { field: "body", message: "Request body must be a JSON object" },
      ]);
    }

    // ---- approval decision (typed routing) ----
    if (resource === "approvals") {
      const decision =
        typeof body.decision === "string"
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
      const type = isApprovalType(row.type) ? row.type : null;
      if (!type || !mayDecideApproval(role, type)) {
        return forbiddenResponse(
          "Your role cannot decide this approval type",
        );
      }
      if (row.requester_id === user.id) {
        return forbiddenResponse("Requesters cannot decide their own request");
      }
      if (row.status !== "pending") {
        return validationErrorResponse(
          [{ field: "status", message: "This approval is already decided" }],
          "This approval is already decided",
        );
      }
      const now = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from("approvals")
        .update({
          status: decision,
          decided_by: user.id,
          decided_at: now,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        if ((error as { code?: string }).code === "42501") {
          return forbiddenResponse();
        }
        throw error;
      }
      return successResponse(updated);
    }

    // ---- change-request decision (staff, no self-decision) ----
    if (resource === "changes") {
      const decision =
        typeof body.decision === "string"
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
      if (role !== "ADMIN" && role !== "PROJECT_MANAGER") {
        return forbiddenResponse();
      }
      if (row.requester_id === user.id) {
        return forbiddenResponse("Requesters cannot decide their own request");
      }
      if (row.status !== "pending") {
        return validationErrorResponse(
          [{ field: "status", message: "This request is already decided" }],
          "This request is already decided",
        );
      }
      const now = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from("change_requests")
        .update({ status: decision, decided_at: now })
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        if ((error as { code?: string }).code === "42501") {
          return forbiddenResponse();
        }
        throw error;
      }
      return successResponse(updated);
    }

    // ---- field edits ----
    if (resource === "budget" || resource === "contracts") {
      if (!mayViewBudgetContracts(role) || !mayEditBudgetContracts(role)) {
        return forbiddenResponse();
      }
      const patch: Record<string, string | null> = {};
      if (resource === "budget") {
        if (body.category !== undefined && typeof body.category === "string") {
          patch.category = body.category.trim();
        }
        if (body.allocated !== undefined && Number.isFinite(Number(body.allocated))) {
          patch.allocated = String(Number(body.allocated));
        }
        if (body.spent !== undefined && Number.isFinite(Number(body.spent))) {
          patch.spent = String(Number(body.spent));
        }
      } else {
        for (const field of ["name", "vendor", "value", "status", "expiry"] as const) {
          if (body[field] !== undefined) {
            patch[field] =
              body[field] === null ? null : String(body[field]);
          }
        }
      }
      if (Object.keys(patch).length === 0) {
        return validationErrorResponse([
          { field: "body", message: "No editable field provided" },
        ]);
      }
      const { data: updated, error } = await supabase
        .from(TABLE[resource])
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        if ((error as { code?: string }).code === "42501") {
          return forbiddenResponse();
        }
        throw error;
      }
      return successResponse(updated);
    }

    // milestones
    if (!mayViewMilestones(role) || !mayEditMilestones(role)) {
      return forbiddenResponse();
    }
    const patch: Record<string, string | boolean | number | null> = {};
    if (body.name !== undefined && typeof body.name === "string") {
      patch.name = body.name.trim();
    }
    if (body.targetDate !== undefined && typeof body.targetDate === "string") {
      patch.target_date = body.targetDate.slice(0, 10);
    }
    if (body.completed !== undefined) {
      patch.completed = body.completed === true;
      if (body.completed === true) {
        patch.completed_at = new Date().toISOString();
      }
    }
    if (Object.keys(patch).length === 0) {
      return validationErrorResponse([
        { field: "body", message: "No editable field provided" },
      ]);
    }
    const { data: updated, error } = await supabase
      .from("milestones")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "42501") {
        return forbiddenResponse();
      }
      throw error;
    }
    return successResponse(updated);
  } catch (error) {
    console.error("PATCH /api/governance/[id] failed:", error);
    return internalErrorResponse();
  }
}

/**
 * DELETE /api/governance/[id]?resource=X — ADMIN only.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id } = await context.params;
    if (!isUuid(id)) {
      return validationErrorResponse([
        { field: "id", message: "id must be a valid UUID" },
      ]);
    }
    const resource = parseResource(request.nextUrl.searchParams.get("resource"));
    if (!resource) {
      return validationErrorResponse([
        {
          field: "resource",
          message:
            "resource must be budget, contracts, approvals, changes, or milestones",
        },
      ]);
    }

    const scope = await resolveRequestScope(supabase, user.id);
    const row = await loadRow(supabase, resource, id);
    if (!row || typeof row.project_id !== "string") {
      return notFoundResponse("Record not found");
    }
    if (!(await isProjectAccessible(supabase, row.project_id))) {
      return notFoundResponse("Record not found");
    }
    const { data: project } = await supabase
      .from("projects")
      .select("id,organization_id")
      .eq("id", row.project_id)
      .limit(1)
      .maybeSingle();
    const orgId = (project as { organization_id?: string } | null)
      ?.organization_id;
    if (!orgId || scope.rolesByOrg[orgId] !== "ADMIN") {
      return forbiddenResponse("Only Administrators can delete governance records");
    }

    const { error } = await supabase
      .from(TABLE[resource])
      .delete()
      .eq("id", id);
    if (error) {
      if ((error as { code?: string }).code === "42501") {
        return forbiddenResponse();
      }
      throw error;
    }
    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("DELETE /api/governance/[id] failed:", error);
    return internalErrorResponse();
  }
}
