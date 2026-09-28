import type { NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { runAiPrioritization } from "@/services/ai-prioritization.service";
import {
  isProjectAccessible,
  isRequirementAccessible,
} from "@/api/access";
import { parsePagination } from "@/api/pagination";
import {
  forbiddenResponse,
  internalErrorResponse,
  successResponse,
} from "@/api/response";
import { validateAiRecommendationQuery } from "@/schemas/ai-recommendation-query";
import { mayViewAiRecommendations } from "@/services/rbac";
import { listAiRecommendations } from "@/repositories/ai-recommendation.repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai-recommendations — authenticated, project-scoped AI
 * prediction listing (read-only; the AI model itself is out of scope).
 *
 * Auth: 401 UNAUTHENTICATED without a verified Supabase session (cookie)
 * or Bearer token. Predictions are sensitive project data: RLS
 * (`ai_predictions_select_staff` / `ai_predictions_select_member`)
 * derives visibility through the requirement → project → organization
 * chain as the caller, never from client-supplied user/org/role claims.
 * Explicit `projectId` / `requirementId` filters outside the caller's
 * scope are rejected with 403 FORBIDDEN (same answer as non-existent
 * rows, so identifiers cannot be used to probe or bypass access control).
 * Always paginated (`?page=1&pageSize=20`, pageSize clamped to 100).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) {
      return auth.response;
    }
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    // Matrix: HR cannot view AI priority recommendations.
    if (
      scope.organizationIds.length > 0 &&
      !Object.values(scope.rolesByOrg).some((role) =>
        mayViewAiRecommendations(role),
      )
    ) {
      return forbiddenResponse();
    }

    const searchParams = request.nextUrl.searchParams;

    const pagination = parsePagination(searchParams);
    if ("response" in pagination) {
      return pagination.response;
    }

    const validated = validateAiRecommendationQuery(searchParams);
    if ("response" in validated) {
      return validated.response;
    }
    const { filters } = validated;

    if (filters.projectId) {
      const accessible = await isProjectAccessible(
        supabase,
        filters.projectId,
      );
      if (!accessible) {
        return forbiddenResponse();
      }
    }

    if (filters.requirementId) {
      const accessible = await isRequirementAccessible(
        supabase,
        filters.requirementId,
      );
      if (!accessible) {
        return forbiddenResponse();
      }
    }

    const result = await listAiRecommendations(supabase, {
      projectId: filters.projectId,
      requirementId: filters.requirementId,
      status: filters.status,
      page: pagination.params.page,
      pageSize: pagination.params.pageSize,
    });

    return successResponse(result.items, {
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("GET /api/ai-recommendations failed:", error);
    return internalErrorResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(
      supabase,
      user.id,
    );

    // Only ADMIN / PROJECT_MANAGER can run AI prioritization.
    if (!scope.isStaffAnywhere) {
      return forbiddenResponse();
    }

    let projectId: string | undefined;

    try {
      const body = await request.json();

      if (
        body !== null &&
        typeof body === "object" &&
        "projectId" in body &&
        body.projectId !== undefined
      ) {
        if (typeof body.projectId !== "string") {
          return forbiddenResponse();
        }

        projectId = body.projectId;
      }
    } catch {
      // Empty request body is allowed:
      // analyze all requirements visible to the caller.
    }

    const result = await runAiPrioritization(
      supabase,
      { projectId },
    );

    return successResponse(result);
  } catch (error) {
    console.error(
      "POST /api/ai-recommendations failed:",
      error,
    );

    return internalErrorResponse();
  }
}