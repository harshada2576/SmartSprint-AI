import { type NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import { mayApproveRiskDomain } from "@/services/rbac";
import {
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { isUuid } from "@/schemas/query-params";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/risks/[id] — edit/resolve a risk under the risk-domain model
 * (§1.2.5, §1.3 Risks):
 * - ADMIN / PROJECT_MANAGER: any domain (incl. technical + NULL).
 * - FINANCE: budget/resource only. LEGAL: legal only.
 * - DEVELOPER / HR: never (403).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id: riskId } = await context.params;
    if (!isUuid(riskId)) {
      return validationErrorResponse([
        { field: "id", message: "Risk id must be a valid UUID" },
      ]);
    }

    const scope = await resolveRequestScope(supabase, user.id);

    const { data: current, error: loadError } = await supabase
      .from("risks")
      .select(
        "id,project_id,task_id,title,description,probability,impact,owner_id,mitigation,status,source,risk_domain",
      )
      .eq("id", riskId)
      .limit(1)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!current) {
      return notFoundResponse("Risk not found");
    }
    const row = current as {
      id: string;
      project_id: string;
      risk_domain: string | null;
    };

    if (!(await isProjectAccessible(supabase, row.project_id))) {
      return notFoundResponse("Risk not found");
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id,organization_id")
      .eq("id", row.project_id)
      .limit(1)
      .maybeSingle();
    if (projectError) throw projectError;
    const organizationId = (project as { organization_id?: string } | null)
      ?.organization_id;
    if (!organizationId) {
      return notFoundResponse("Risk not found");
    }
    const callerRole = scope.rolesByOrg[organizationId];

    if (!mayApproveRiskDomain(callerRole, row.risk_domain)) {
      return forbiddenResponse(
        "Insufficient permissions for this risk domain",
      );
    }

    const body = await request.json().catch(() => ({}));

    const patch: Record<string, string | null> = {};
    if (
      body.status &&
      ["open", "mitigated", "closed"].includes(body.status)
    ) {
      patch.status = body.status;
    }
    if (body.mitigation !== undefined) {
      patch.mitigation =
        typeof body.mitigation === "string" ? body.mitigation.trim() : null;
    }
    if (body.impact && ["high", "medium", "low"].includes(body.impact)) {
      patch.impact = body.impact;
    }
    if (
      body.probability &&
      ["high", "medium", "low"].includes(body.probability)
    ) {
      patch.probability = body.probability;
    }
    if (Object.keys(patch).length === 0) {
      return validationErrorResponse([
        { field: "body", message: "No editable field provided" },
      ]);
    }

    const { data: updated, error: updateError } = await supabase
      .from("risks")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", riskId)
      .select(
        "id,project_id,task_id,title,description,probability,impact,owner_id,mitigation,status,source,risk_domain,created_at,updated_at",
      )
      .single();
    if (updateError) {
      const code = (updateError as { code?: string }).code;
      if (code === "42501") {
        return forbiddenResponse(
          "Insufficient permissions for this risk domain",
        );
      }
      throw updateError;
    }

    return successResponse(updated);
  } catch (error) {
    console.error("PATCH /api/risks/[id] failed:", error);
    return internalErrorResponse();
  }
}
