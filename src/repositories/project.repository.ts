import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { ProjectsQuery } from "@/schemas/list-queries";
import {
  escapeIlikeLiteral,
  toOffsetLimit,
} from "@/utils/api-response";

/**
 * Project data access — scoped to the authenticated caller.
 *
 * Ownership: Backend/API agent (`src/repositories/**`).
 *
 * Security:
 * - Every function takes the user-scoped Supabase client (carrying the
 *   caller's JWT) plus the server-derived `RequestScope`. Row filtering is
 *   enforced by the RLS policies (`projects_select_org_staff`,
 *   `projects_select_member`); the explicit `organization_id IN (…)` clause
 *   is defense-in-depth so intent is visible in code and a misconfigured
 *   policy cannot silently widen results.
 * - The insecure unbounded `getAllProjects()` (privileged Drizzle pool, no
 *   auth) is intentionally REMOVED. There is no unscoped project reader.
 * - Thrown errors carry generic codes only; routes log them server-side and
 *   return the shared `INTERNAL_ERROR` envelope (never SQL/details).
 */

export interface ProjectRow {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  description: string | null;
  client: string | null;
  manager_id: string | null;
  method: string;
  status: string;
  priority: string;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  budget_total: string | null;
  budget_currency: string | null;
  created_at: string;
  updated_at: string;
}

/** Minimal projection used for server-side access verification. */
export interface AccessibleProject {
  id: string;
  organization_id: string;
}

export interface ListProjectsResult {
  rows: ProjectRow[];
  total: number;
}

function toProjectRow(value: unknown): ProjectRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  if (typeof row.organization_id !== "string") return null;
  if (typeof row.name !== "string") return null;
  return value as ProjectRow;
}

/**
 * Single project visible to the caller, or `null` when it does not exist or
 * is outside the caller's organization/project scope (no existence oracle).
 * Used to gate child-collection queries (requirements/sprints/tasks).
 */
export async function findAccessibleProjectById(
  client: SupabaseClient,
  scope: RequestScope,
  projectId: string,
): Promise<AccessibleProject | null> {
  if (scope.organizationIds.length === 0) return null;
  const { data, error } = await client
    .from("projects")
    .select("id, organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    throw new Error("project_lookup_failed");
  }
  if (typeof data !== "object" || data === null) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  if (typeof row.organization_id !== "string") return null;
  return { id: row.id, organization_id: row.organization_id };
}

/**
 * Paginated projects accessible to the caller (RLS-scoped + explicit
 * organization filter). No `organization_id` is ever accepted from the
 * browser — scope comes from `RequestScope` only.
 */
export async function listProjectsScoped(
  client: SupabaseClient,
  scope: RequestScope,
  filters: ProjectsQuery,
): Promise<ListProjectsResult> {
  if (scope.organizationIds.length === 0) {
    return { rows: [], total: 0 };
  }

  const { offset, limit } = toOffsetLimit({
    page: filters.page,
    pageSize: filters.pageSize,
  });

  let query = client
    .from("projects")
    .select("*", { count: "exact" })
    .in("organization_id", scope.organizationIds);

  if (filters.status !== undefined) {
    query = query.eq("status", filters.status);
  }
  if (filters.search !== undefined) {
    const pattern = `%${escapeIlikeLiteral(filters.search)}%`;
    query = query.or(
      `name.ilike.${pattern},client.ilike.${pattern},code.ilike.${pattern}`,
    );
  }

  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error("projects_list_failed");
  }

  const rows: ProjectRow[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      const row = toProjectRow(item);
      if (row) rows.push(row);
    }
  }
  return { rows, total: count ?? rows.length };
}
