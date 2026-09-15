import type { NextResponse } from "next/server";
import { validationErrorResponse } from "@/api/response";
import type { ApiErrorDetail } from "@/api/response";
import { getQueryParam, isUuid } from "./query-params";

/** AI recommendation lifecycle states (`ai_predictions.recommendation_status`). */
export const AI_RECOMMENDATION_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export type AiRecommendationStatusFilter =
  (typeof AI_RECOMMENDATION_STATUSES)[number];

export interface AiRecommendationQueryFilters {
  projectId?: string;
  requirementId?: string;
  status?: AiRecommendationStatusFilter;
}

export type AiRecommendationQueryResult =
  | { filters: AiRecommendationQueryFilters }
  | { response: NextResponse };

/**
 * Validates `GET /api/ai-recommendations` query parameters. Accepts
 * `projectId` (or legacy `project_id`), `requirementId` (or legacy
 * `requirement_id`), and lifecycle `status`. Access to the referenced
 * project/requirement is verified against the caller's RLS scope by the
 * route — the identifiers here are filters only, never authority.
 */
export function validateAiRecommendationQuery(
  searchParams: URLSearchParams,
): AiRecommendationQueryResult {
  const details: ApiErrorDetail[] = [];
  const filters: AiRecommendationQueryFilters = {};

  const projectId = getQueryParam(searchParams, "projectId", "project_id");
  if (projectId !== null) {
    if (!isUuid(projectId)) {
      details.push({
        field: "projectId",
        message: 'Query parameter "projectId" must be a valid UUID',
      });
    } else {
      filters.projectId = projectId;
    }
  }

  const requirementId = getQueryParam(
    searchParams,
    "requirementId",
    "requirement_id",
  );
  if (requirementId !== null) {
    if (!isUuid(requirementId)) {
      details.push({
        field: "requirementId",
        message: 'Query parameter "requirementId" must be a valid UUID',
      });
    } else {
      filters.requirementId = requirementId;
    }
  }

  const status = getQueryParam(searchParams, "status");
  if (status !== null) {
    if (
      !(AI_RECOMMENDATION_STATUSES as readonly string[]).includes(status)
    ) {
      details.push({
        field: "status",
        message: `Query parameter "status" must be one of: ${AI_RECOMMENDATION_STATUSES.join(", ")}`,
      });
    } else {
      filters.status = status as AiRecommendationStatusFilter;
    }
  }

  if (details.length > 0) {
    return { response: validationErrorResponse(details) };
  }
  return { filters };
}
