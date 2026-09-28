import { type NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import { runProjectRiskAnalysis } from "@/services/risk-engine.service";
import { isRiskDomain } from "@/services/rbac";
import {
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { isUuid } from "@/schemas/query-params";

export const dynamic = "force-dynamic";

/**
 * GET /api/risks — project风险 list with synchronous AI risk detection.
 *
 * Auth: any authenticated member with project visibility. HR has zero
 * project visibility (no project_members rows, non-staff) so HR receives
 * 404/empty through the same RLS probes — never project data.
 * Reads run through the caller's RLS-enforcing client; the explicit
 * accessibility probes are defense-in-depth (no existence oracle).
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

    const projectId = request.nextUrl.searchParams.get("projectId");
    const autoAnalyze = request.nextUrl.searchParams.get("analyze") !== "false";

    if (projectId) {
      if (!isUuid(projectId)) {
        return validationErrorResponse([
          { field: "projectId", message: "projectId must be a valid UUID" },
        ]);
      }
      if (!(await isProjectAccessible(supabase, projectId))) {
        return notFoundResponse("Project not found");
      }

      // Synchronous AI risk detection on monitoring evaluation (§5.4).
      if (autoAnalyze) {
        await runProjectRiskAnalysis(projectId).catch((err) =>
          console.error("AI risk engine background run error:", err),
        );
      }

      const { data, error } = await supabase
        .from("risks")
        .select(
          "id,project_id,task_id,title,description,probability,impact,owner_id,mitigation,status,source,risk_domain,created_at,updated_at",
        )
        .eq("project_id", projectId)
        .limit(200);
      if (error) throw error;
      return successResponse(Array.isArray(data) ? data : []);
    }

    // Risks for caller-visible projects only (RLS-filtered project list, so
    // FINANCE/LEGAL see member projects and HR sees none).
    const { data: visibleProjects, error: projectsError } = await supabase
      .from("projects")
      .select("id")
      .limit(100);
    if (projectsError) throw projectsError;
    const projectIds = (Array.isArray(visibleProjects) ? visibleProjects : [])
      .map((p) => (p as { id?: unknown }).id)
      .filter((v): v is string => typeof v === "string");
    if (projectIds.length === 0) {
      return successResponse([]);
    }

    if (autoAnalyze) {
      for (const pid of projectIds.slice(0, 3)) {
        await runProjectRiskAnalysis(pid).catch(() => {});
      }
    }

    const { data: rows, error } = await supabase
      .from("risks")
      .select(
        "id,project_id,task_id,title,description,probability,impact,owner_id,mitigation,status,source,risk_domain,created_at,updated_at",
      )
      .in("project_id", projectIds)
      .limit(200);
    if (error) throw error;
    return successResponse(Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.error("GET /api/risks failed:", error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/risks — file a risk.
 * Matrix (Create): ADMIN, PM, DEVELOPER, FINANCE, LEGAL in a visible
 * project. HR is denied (no project visibility).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return validationErrorResponse([
        { field: "body", message: "Request body must be a JSON object" },
      ]);
    }

    const projectId =
      typeof (body as { projectId?: unknown }).projectId === "string"
        ? ((body as { projectId: string }).projectId.trim())
        : "";
    if (!isUuid(projectId)) {
      return validationErrorResponse([
        { field: "projectId", message: "projectId must be a valid UUID" },
      ]);
    }
    if (!(await isProjectAccessible(supabase, projectId))) {
      return notFoundResponse("Project not found");
    }

    // HR denial (defense-in-depth; the probe above already excludes HR).
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id,organization_id")
      .eq("id", projectId)
      .limit(1)
      .maybeSingle();
    if (projectError) throw projectError;
    const organizationId = (project as { organization_id?: string } | null)
      ?.organization_id;
    if (!organizationId) {
      return notFoundResponse("Project not found");
    }
    const callerRole = scope.rolesByOrg[organizationId];
    if (callerRole === "HR" || !callerRole) {
      return forbiddenResponse("Insufficient permissions");
    }

    const record = body as Record<string, unknown>;
    const title =
      typeof record.title === "string" ? record.title.trim() : "";
    if (!title) {
      return validationErrorResponse([
        { field: "title", message: "Title is required" },
      ]);
    }

    const description =
      typeof record.description === "string"
        ? record.description.trim()
        : null;
    const probability = ["high", "medium", "low"].includes(
      record.probability as string,
    )
      ? (record.probability as string)
      : "medium";
    const impact = ["high", "medium", "low"].includes(record.impact as string)
      ? (record.impact as string)
      : "medium";
    const mitigation =
      typeof record.mitigation === "string" ? record.mitigation.trim() : null;
    const taskId =
      typeof record.taskId === "string" && isUuid(record.taskId)
        ? record.taskId
        : null;
    const riskDomain =
      typeof record.riskDomain === "string" && isRiskDomain(record.riskDomain)
        ? record.riskDomain
        : null;

    // taskId must belong to the same project (same-project guard).
    if (taskId) {
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("id,project_id")
        .eq("id", taskId)
        .limit(1)
        .maybeSingle();
      if (taskError) throw taskError;
      if (
        !task ||
        (task as { project_id?: string }).project_id !== projectId
      ) {
        return validationErrorResponse([
          {
            field: "taskId",
            message: "taskId must reference a task in the same project",
          },
        ]);
      }
    }

    const { data: created, error } = await supabase
      .from("risks")
      .insert({
        project_id: projectId,
        task_id: taskId,
        title,
        description,
        probability,
        impact,
        mitigation,
        status: "open",
        source: "manual",
        owner_id: user.id,
        risk_domain: riskDomain,
      })
      .select(
        "id,project_id,task_id,title,description,probability,impact,owner_id,mitigation,status,source,risk_domain,created_at,updated_at",
      )
      .single();
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "42501") return forbiddenResponse();
      throw error;
    }

    return successResponse(created);
  } catch (error) {
    console.error("POST /api/risks failed:", error);
    return internalErrorResponse();
  }
}
