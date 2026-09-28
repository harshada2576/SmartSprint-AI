import type { NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import {
  mayEditBudgetContracts,
  mayEditMilestones,
  maySubmitApproval,
  mayViewBudgetContracts,
  mayViewMilestones,
  mayViewMonitoring,
  isApprovalType,
} from "@/services/rbac";
import {
  createdResponse,
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { isUuid } from "@/schemas/query-params";
import type { AppRole } from "@/types/api";

export const dynamic = "force-dynamic";

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

async function projectOrg(
  supabase: Parameters<typeof isProjectAccessible>[0],
  projectId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id,organization_id")
    .eq("id", projectId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const org = (data as { organization_id?: string } | null)?.organization_id;
  return typeof org === "string" ? org : null;
}

/**
 * GET /api/governance?resource=budget|contracts|approvals|changes|milestones&projectId=<uuid>
 *
 * Matrix:
 * - budget/contracts view: ADMIN, PM, FINANCE, LEGAL (member projects for
 *   specialists). DEV/HR denied.
 * - milestones view: ADMIN, PM, DEV, FINANCE, LEGAL. HR denied.
 * - approvals/changes view: ADMIN, PM, DEV, FINANCE, LEGAL with project
 *   visibility. HR denied.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    const resource = parseResource(
      request.nextUrl.searchParams.get("resource"),
    );
    const projectId = request.nextUrl.searchParams.get("projectId") ?? "";
    if (!resource) {
      return validationErrorResponse([
        {
          field: "resource",
          message:
            "resource must be budget, contracts, approvals, changes, or milestones",
        },
      ]);
    }
    if (!isUuid(projectId)) {
      return validationErrorResponse([
        { field: "projectId", message: "projectId must be a valid UUID" },
      ]);
    }
    if (!(await isProjectAccessible(supabase, projectId))) {
      return notFoundResponse("Project not found");
    }
    const orgId = await projectOrg(supabase, projectId);
    if (!orgId) return notFoundResponse("Project not found");
    const role = scope.rolesByOrg[orgId] as AppRole | undefined;

    if (resource === "budget" || resource === "contracts") {
      if (!mayViewBudgetContracts(role)) return forbiddenResponse();
    } else if (resource === "milestones") {
      if (!mayViewMilestones(role)) return forbiddenResponse();
    } else {
      if (!mayViewMonitoring(role)) return forbiddenResponse();
    }

    const table =
      resource === "budget"
        ? "budget_line_items"
        : resource === "contracts"
          ? "contracts"
          : resource === "approvals"
            ? "approvals"
            : resource === "changes"
              ? "change_requests"
              : "milestones";
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("project_id", projectId)
      .limit(200);
    if (error) throw error;
    return successResponse(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error("GET /api/governance failed:", error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/governance — create budget line / contract / approval /
 * change request / milestone, or decide an approval when
 * `{ resource: "approvals", id, decision }` targets an existing row
 * (decisions also available via PATCH /api/governance/[id]).
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
    const resource = parseResource(
      typeof body.resource === "string" ? body.resource : null,
    );
    const projectId =
      typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!resource) {
      return validationErrorResponse([
        {
          field: "resource",
          message:
            "resource must be budget, contracts, approvals, changes, or milestones",
        },
      ]);
    }
    if (!isUuid(projectId)) {
      return validationErrorResponse([
        { field: "projectId", message: "projectId must be a valid UUID" },
      ]);
    }
    if (!(await isProjectAccessible(supabase, projectId))) {
      return notFoundResponse("Project not found");
    }
    const orgId = await projectOrg(supabase, projectId);
    if (!orgId) return notFoundResponse("Project not found");
    const role = scope.rolesByOrg[orgId] as AppRole | undefined;

    // ---- budget ----
    if (resource === "budget") {
      if (!mayEditBudgetContracts(role)) return forbiddenResponse();
      const category =
        typeof body.category === "string" ? body.category.trim() : "";
      const allocated = Number(body.allocated);
      if (!category) {
        return validationErrorResponse([
          { field: "category", message: "category is required" },
        ]);
      }
      if (!Number.isFinite(allocated) || allocated < 0) {
        return validationErrorResponse([
          { field: "allocated", message: "allocated must be a number >= 0" },
        ]);
      }
      const { data, error } = await supabase
        .from("budget_line_items")
        .insert({
          project_id: projectId,
          category,
          allocated: String(allocated),
          spent: String(Number(body.spent ?? 0) || 0),
        })
        .select("*")
        .single();
      if (error) {
        if ((error as { code?: string }).code === "42501") {
          return forbiddenResponse();
        }
        throw error;
      }
      return createdResponse(data);
    }

    // ---- contracts ----
    if (resource === "contracts") {
      if (!mayEditBudgetContracts(role)) return forbiddenResponse();
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const vendor = typeof body.vendor === "string" ? body.vendor.trim() : "";
      const value = Number(body.value);
      if (!name || !vendor) {
        return validationErrorResponse([
          { field: "name", message: "name and vendor are required" },
        ]);
      }
      if (!Number.isFinite(value) || value < 0) {
        return validationErrorResponse([
          { field: "value", message: "value must be a number >= 0" },
        ]);
      }
      const status = ["active", "pending", "expired", "terminated"].includes(
        body.status as string,
      )
        ? (body.status as string)
        : "pending";
      const { data, error } = await supabase
        .from("contracts")
        .insert({
          project_id: projectId,
          name,
          vendor,
          value: String(value),
          status,
          expiry:
            typeof body.expiry === "string" ? body.expiry.slice(0, 10) : null,
        })
        .select("*")
        .single();
      if (error) {
        if ((error as { code?: string }).code === "42501") {
          return forbiddenResponse();
        }
        throw error;
      }
      return createdResponse(data);
    }

    // ---- approvals (typed submit routing) ----
    if (resource === "approvals") {
      const type = isApprovalType(body.type) ? body.type : null;
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!type) {
        return validationErrorResponse([
          {
            field: "type",
            message: "type must be scope, budget, vendor, or resource",
          },
        ]);
      }
      if (!title) {
        return validationErrorResponse([
          { field: "title", message: "title is required" },
        ]);
      }
      if (!maySubmitApproval(role, type)) {
        return forbiddenResponse(
          "Your role cannot submit this approval type",
        );
      }
      const { data, error } = await supabase
        .from("approvals")
        .insert({
          project_id: projectId,
          title,
          requester_id: user.id,
          type,
          status: "pending",
          target_type:
            typeof body.targetType === "string" ? body.targetType : null,
          target_id:
            typeof body.targetId === "string" && isUuid(body.targetId)
              ? body.targetId
              : null,
          notes: typeof body.notes === "string" ? body.notes : null,
        })
        .select("*")
        .single();
      if (error) {
        if ((error as { code?: string }).code === "42501") {
          return forbiddenResponse();
        }
        throw error;
      }
      return createdResponse(data);
    }

    // ---- change requests (submit: visible members except HR) ----
    if (resource === "changes") {
      if (!mayViewMonitoring(role)) return forbiddenResponse();
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        return validationErrorResponse([
          { field: "title", message: "title is required" },
        ]);
      }
      const type = ["feature", "technical", "process"].includes(
        body.type as string,
      )
        ? (body.type as string)
        : "feature";
      const impact = ["high", "medium", "low"].includes(body.impact as string)
        ? (body.impact as string)
        : "medium";
      const { data, error } = await supabase
        .from("change_requests")
        .insert({
          project_id: projectId,
          title,
          description:
            typeof body.description === "string" ? body.description : null,
          type,
          impact,
          status: "pending",
          requester_id: user.id,
        })
        .select("*")
        .single();
      if (error) {
        if ((error as { code?: string }).code === "42501") {
          return forbiddenResponse();
        }
        throw error;
      }
      return createdResponse(data);
    }

    // ---- milestones (edit: ADMIN, PM, FINANCE) ----
    if (!mayEditMilestones(role)) return forbiddenResponse();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const targetDate =
      typeof body.targetDate === "string" ? body.targetDate.slice(0, 10) : "";
    if (!name || !targetDate) {
      return validationErrorResponse([
        { field: "name", message: "name and targetDate are required" },
      ]);
    }
    const { data, error } = await supabase
      .from("milestones")
      .insert({
        project_id: projectId,
        name,
        target_date: targetDate,
        completed: body.completed === true,
        sort_order: Number.isFinite(Number(body.sortOrder))
          ? Number(body.sortOrder)
          : 0,
      })
      .select("*")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "42501") {
        return forbiddenResponse();
      }
      throw error;
    }
    return createdResponse(data);
  } catch (error) {
    console.error("POST /api/governance failed:", error);
    return internalErrorResponse();
  }
}

