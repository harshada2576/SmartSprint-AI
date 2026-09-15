import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { RequirementsQuery } from "@/schemas/list-queries";
import {
  escapeIlikeLiteral,
  toOffsetLimit,
} from "@/api/pagination";
import { findAccessibleProjectById } from "@/repositories/project.repository";
import { findAccessibleSprintById } from "@/repositories/sprint.repository";

/**
 * Requirement data access — scoped to the authenticated caller.
 *
 * Ownership: Backend/API agent (`src/repositories/**`).
 *
 * Security: same model as `project.repository.ts` — user-scoped Supabase
 * client so RLS (`requirements_select_staff` / `requirements_select_member`)
 * enforces project→organization membership. `projectId` is verified
 * server-side (inaccessible → `null` → route 404, no existence oracle).
 * `sprintId` is verified the same way but fails closed to an empty list
 * (filter semantics). The unbounded `getAllRequirements()` is REMOVED.
 */

export interface RequirementRow {
  id: string;
  display_id: string;
  project_id: string;
  title: string;
  description: string | null;
  category: string;
  business_value: string;
  customer_importance: number | null;
  urgency: number | null;
  complexity: number | null;
  estimated_effort: number | null;
  risk: number | null;
  story_points: number | null;
  dependency_id: string | null;
  priority: string;
  status: string;
  assignee_id: string | null;
  sprint_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListRequirementsResult {
  rows: RequirementRow[];
  total: number;
}

function toRequirementRow(value: unknown): RequirementRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  if (typeof row.project_id !== "string") return null;
  if (typeof row.title !== "string") return null;
  return value as RequirementRow;
}

/**
 * Paginated requirements accessible to the caller.
 * Returns `null` only when `projectId` names an inaccessible project
 * (route maps to 404). All other scoping failures yield an empty list.
 */
export async function listRequirementsScoped(
  client: SupabaseClient,
  scope: RequestScope,
  filters: RequirementsQuery,
): Promise<ListRequirementsResult | null> {
  if (scope.organizationIds.length === 0) {
    return { rows: [], total: 0 };
  }

  if (filters.projectId !== undefined) {
    const project = await findAccessibleProjectById(
      client,
      scope,
      filters.projectId,
    );
    if (!project) return null;
  }

  // sprintId must reference an accessible sprint in the same project when
  // projectId is also given; otherwise the conjunction is unsatisfiable or
  // out of scope → fail closed with an empty list (never an error oracle).
  if (filters.sprintId !== undefined) {
    const sprint = await findAccessibleSprintById(
      client,
      scope,
      filters.sprintId,
    );
    if (!sprint) {
      return { rows: [], total: 0 };
    }
    if (
      filters.projectId !== undefined &&
      sprint.project_id !== filters.projectId
    ) {
      return { rows: [], total: 0 };
    }
  }

  const { offset, limit } = toOffsetLimit({
    page: filters.page,
    pageSize: filters.pageSize,
  });

  let query = client.from("requirements").select("*", { count: "exact" });

  if (filters.projectId !== undefined) {
    query = query.eq("project_id", filters.projectId);
  }
  if (filters.sprintId !== undefined) {
    query = query.eq("sprint_id", filters.sprintId);
  }
  if (filters.status !== undefined) {
    query = query.eq("status", filters.status);
  }
  if (filters.priority !== undefined) {
    query = query.eq("priority", filters.priority);
  }
  if (filters.search !== undefined) {
    const pattern = `%${escapeIlikeLiteral(filters.search)}%`;
    query = query.or(
      `title.ilike.${pattern},description.ilike.${pattern},display_id.ilike.${pattern}`,
    );
  }

  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error("requirements_list_failed");
  }

  const rows: RequirementRow[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      const row = toRequirementRow(item);
      if (row) rows.push(row);
    }
  }
  return { rows, total: count ?? rows.length };
}
