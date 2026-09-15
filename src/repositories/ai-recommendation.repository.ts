import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPagination,
  type PaginatedResult,
} from "@/types/secondary-api";

export interface AiRecommendationListOptions {
  projectId?: string;
  requirementId?: string;
  status?: string;
  page: number;
  pageSize: number;
}

export interface AiRecommendationListRequirement {
  id: string;
  project_id: string;
  display_id: string;
  title: string;
  status: string;
}

export interface AiRecommendationListItem {
  id: string;
  requirement_id: string;
  suggested_priority: string | null;
  suggested_sprint_id: string | null;
  confidence_score: string | number | null;
  summary: string | null;
  reasoning: unknown;
  recommendation_status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  requirements: AiRecommendationListRequirement;
}

/**
 * AI prediction reads scoped to the authenticated caller.
 *
 * SECURITY: `client` must be the caller's RLS-enforcing Supabase client
 * (from `getAuthenticatedContext`), never the privileged Drizzle pool.
 * Predictions are sensitive project data: RLS (`ai_predictions_select_staff`
 * / `ai_predictions_select_member`) derives visibility through the
 * requirement → project → organization chain, so only predictions whose
 * parent project the caller may see are returned. `projectId` /
 * `requirementId` filters only narrow that visible set — the route verifies
 * the referenced project/requirement is itself visible before querying, so
 * arbitrary identifiers cannot bypass access control. This module never
 * implements, invokes, or alters the AI model itself. Results are always
 * paginated, newest first.
 */
const AI_RECOMMENDATION_SELECT =
  "id,requirement_id,suggested_priority,suggested_sprint_id,confidence_score,summary,reasoning,recommendation_status,approved_by,approved_at,created_at,updated_at,requirements!inner(id,project_id,display_id,title,status)";

export async function listAiRecommendations(
  client: SupabaseClient,
  options: AiRecommendationListOptions,
): Promise<PaginatedResult<AiRecommendationListItem>> {
  const { page, pageSize } = options;

  let query = client
    .from("ai_predictions")
    .select(AI_RECOMMENDATION_SELECT, { count: "exact" });

  if (options.projectId) {
    query = query.eq("requirements.project_id", options.projectId);
  }
  if (options.requirementId) {
    query = query.eq("requirement_id", options.requirementId);
  }
  if (options.status) {
    query = query.eq("recommendation_status", options.status);
  }

  query = query.order("created_at", { ascending: false });

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) {
    throw error;
  }

  const total = count ?? 0;
  return {
    items: ((data ?? []) as unknown) as AiRecommendationListItem[],
    pagination: buildPagination(page, pageSize, total),
  };
}
