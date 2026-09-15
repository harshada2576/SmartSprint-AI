import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPaginationMeta } from "@/api/pagination";
import type { PaginatedResult } from "@/types/api";

export interface BacklogListOptions {
  projectId?: string;
  status?: string;
  priority?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface BacklogListRequirement {
  id: string;
  display_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string;
  story_points: number | null;
  assignee_id: string | null;
  sprint_id: string | null;
}

export interface BacklogListItem {
  id: string;
  project_id: string;
  requirement_id: string;
  rank: number;
  created_at: string;
  requirements: BacklogListRequirement;
}

/**
 * Backlog reads scoped to the authenticated caller.
 *
 * SECURITY: `client` must be the caller's RLS-enforcing Supabase client
 * (from `getAuthenticatedContext`), never the privileged Drizzle pool.
 * PostgreSQL RLS (`backlog_select_staff` / `backlog_select_member`) restricts
 * rows to projects in organizations the caller belongs to — org-wide for
 * ADMIN/PROJECT_MANAGER, explicit project membership for DEVELOPER.
 * `status` / `priority` / `search` filter the joined requirement; RLS on
 * both tables applies, so filters can only narrow the visible set, never
 * widen it. Results are always paginated and ordered by `rank`.
 */
const BACKLOG_SELECT =
  "id,project_id,requirement_id,rank,created_at,requirements!inner(id,display_id,title,description,status,priority,category,story_points,assignee_id,sprint_id)";

export function sanitizeIlikeTerm(term: string): string {
  // Strip PostgREST `or=` structural characters so free text cannot break
  // out of the intended ilike operands. `%`/`_` wildcards left in user
  // input only broaden the match within the caller's RLS scope.
  return term
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export async function listBacklogItems(
  client: SupabaseClient,
  options: BacklogListOptions,
): Promise<PaginatedResult<BacklogListItem>> {
  const { page, pageSize } = options;

  let query = client
    .from("backlog")
    .select(BACKLOG_SELECT, { count: "exact" });

  if (options.projectId) {
    query = query.eq("project_id", options.projectId);
  }
  if (options.status) {
    query = query.eq("requirements.status", options.status);
  }
  if (options.priority) {
    query = query.eq("requirements.priority", options.priority);
  }
  const term = options.search ? sanitizeIlikeTerm(options.search) : "";
  if (term) {
    query = query.or(
      `title.ilike.%${term}%,display_id.ilike.%${term}%,description.ilike.%${term}%`,
      { referencedTable: "requirements" },
    );
  }

  query = query.order("rank", { ascending: true });

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) {
    throw error;
  }

  const total = count ?? 0;
  return {
    items: ((data ?? []) as unknown) as BacklogListItem[],
    pagination: buildPaginationMeta({ page, pageSize }, total),
  };
}
