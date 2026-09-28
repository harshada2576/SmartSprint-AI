import type { NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { mayDecideAiRecommendation } from "@/services/rbac";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * PATCH /api/ai-recommendations/[id] — approve/reject one AI priority
 * recommendation. Matrix: ADMIN / PROJECT_MANAGER only. DEVELOPER,
 * FINANCE, LEGAL, and HR receive 403 (RLS re-enforces: only staff may
 * update ai_predictions, with decider attribution forced to self).
 *
 * Body: `{ "decision": "approved" | "rejected" }`.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id: predictionId } = await context.params;
    if (!isUuid(predictionId)) {
      return validationErrorResponse([
        { field: "id", message: "Recommendation id must be a valid UUID" },
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

    // Load the prediction with its requirement chain (RLS-visible only).
    const { data: prediction, error: loadError } = await supabase
      .from("ai_predictions")
      .select("id,requirement_id,recommendation_status")
      .eq("id", predictionId)
      .limit(1)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!prediction) {
      return notFoundResponse("Recommendation not found");
    }
    const row = prediction as {
      id: string;
      requirement_id: string;
      recommendation_status: string;
    };
    if (row.recommendation_status !== "pending") {
      return validationErrorResponse(
        [
          {
            field: "decision",
            message: "This recommendation has already been decided",
          },
        ],
        "This recommendation has already been decided",
      );
    }

    const { data: requirement, error: reqError } = await supabase
      .from("requirements")
      .select("id,project_id")
      .eq("id", row.requirement_id)
      .limit(1)
      .maybeSingle();
    if (reqError) throw reqError;
    if (!requirement) {
      return notFoundResponse("Recommendation not found");
    }
    const reqRow = requirement as { id: string; project_id: string };

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id,organization_id")
      .eq("id", reqRow.project_id)
      .limit(1)
      .maybeSingle();
    if (projectError) throw projectError;
    const organizationId = (
      project as { organization_id?: string } | null
    )?.organization_id;
    if (!organizationId) {
      return notFoundResponse("Recommendation not found");
    }

    if (!mayDecideAiRecommendation(scope.rolesByOrg[organizationId])) {
      return forbiddenResponse(
        "Only Project Managers and Administrators can decide AI recommendations",
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("ai_predictions")
      .update({
        recommendation_status: decision,
        approved_by: user.id,
        approved_at: now,
        updated_at: now,
      })
      .eq("id", predictionId)
      .select(
        "id,requirement_id,recommendation_status,approved_by,approved_at,updated_at",
      )
      .single();
    if (updateError) {
      const code = (updateError as { code?: string }).code;
      if (code === "42501") return forbiddenResponse();
      throw updateError;
    }

    return successResponse(updated);
  } catch (error) {
    console.error("PATCH /api/ai-recommendations/[id] failed:", error);
    return internalErrorResponse();
  }
}
