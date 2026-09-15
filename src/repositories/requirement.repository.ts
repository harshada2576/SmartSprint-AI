import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { RequirementsQuery } from "@/schemas/list-queries";
import {
  escapeIlikeLiteral,
  toOffsetLimit,
} from "@/api/pagination";
import { findAccessibleProjectById } from "@/repositories/project.repository";
import { findAccessibleSprintById } from "@/repositories/sprint.repository";
import { DbWriteError, toDbWriteError } from "@/repositories/mutation-helpers";

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

// ---------------------------------------------------------------------------
// Mutations (RLS-scoped writes — see `mutation-helpers.ts` for the model).
// ---------------------------------------------------------------------------

export interface RequirementInsert {
  display_id: string;
  project_id: string;
  title: string;
  description?: string | null;
  category: string;
  business_value?: string;
  customer_importance?: number | null;
  urgency?: number | null;
  complexity?: number | null;
  estimated_effort?: number | null;
  risk?: number | null;
  story_points?: number | null;
  dependency_id?: string | null;
  priority?: string;
  status?: string;
  assignee_id?: string | null;
  sprint_id?: string | null;
}

export interface RequirementPatch {
  title?: string;
  description?: string | null;
  category?: string;
  business_value?: string;
  customer_importance?: number | null;
  urgency?: number | null;
  complexity?: number | null;
  estimated_effort?: number | null;
  risk?: number | null;
  story_points?: number | null;
  dependency_id?: string | null;
  priority?: string;
  status?: string;
  assignee_id?: string | null;
  sprint_id?: string | null;
}

/** Minimal projection for same-project linkage checks. */
export interface LinkedRequirement {
  id: string;
  project_id: string;
}

/**
 * Full requirement row by id through the caller's RLS client, or `null`
 * when missing/invisible (no existence oracle). Used to gate mutations.
 */
export async function findRequirementRowById(
  client: SupabaseClient,
  requirementId: string,
): Promise<RequirementRow | null> {
  const { data, error } = await client
    .from("requirements")
    .select("*")
    .eq("id", requirementId)
    .maybeSingle();
  if (error) {
    throw new DbWriteError("failed", "requirement_lookup_failed");
  }
  return toRequirementRow(data);
}

/** Linkage projection for dependency same-project checks. */
export async function findLinkedRequirementById(
  client: SupabaseClient,
  requirementId: string,
): Promise<LinkedRequirement | null> {
  const { data, error } = await client
    .from("requirements")
    .select("id, project_id")
    .eq("id", requirementId)
    .maybeSingle();
  if (error) {
    throw new DbWriteError("failed", "requirement_lookup_failed");
  }
  if (typeof data !== "object" || data === null) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  if (typeof row.project_id !== "string") return null;
  return { id: row.id, project_id: row.project_id };
}

/** Exact count of requirements in a project (for display-ID sequencing). */
export async function countRequirementsInProject(
  client: SupabaseClient,
  projectId: string,
): Promise<number> {
  const { count, error } = await client
    .from("requirements")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (error) {
    throw new DbWriteError("failed", "requirement_count_failed");
  }
  return count ?? 0;
}

/** True when `displayId` is already taken in `projectId`. */
export async function isRequirementDisplayIdTaken(
  client: SupabaseClient,
  projectId: string,
  displayId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("requirements")
    .select("id")
    .eq("project_id", projectId)
    .eq("display_id", displayId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new DbWriteError("failed", "requirement_display_lookup_failed");
  }
  return data !== null;
}

function displayPrefixFromProjectCode(code: string | null): string {
  if (typeof code !== "string") return "REQ";
  const alnum = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (alnum.length === 0) return "REQ";
  return alnum.slice(0, 10);
}

/**
 * Generates the next project-scoped display ID (`AUR-001`-style:
 * `<PROJECTCODE>-<NNN>`). The `UNIQUE(project_id, display_id)` constraint
 * remains the final authority; callers retry on `unique_violation`.
 */
export async function generateRequirementDisplayId(
  client: SupabaseClient,
  projectId: string,
  projectCode: string | null,
  sequenceHint: number,
): Promise<string> {
  const prefix = displayPrefixFromProjectCode(projectCode);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const sequence = sequenceHint + attempt;
    const candidate = `${prefix}-${String(sequence).padStart(3, "0")}`;
    if (!(await isRequirementDisplayIdTaken(client, projectId, candidate))) {
      return candidate;
    }
  }
  throw new DbWriteError("failed", "requirement_display_generation_failed");
}

/** Inserts one requirement through RLS. Throws `DbWriteError` on failure. */
export async function insertRequirement(
  client: SupabaseClient,
  row: RequirementInsert,
): Promise<RequirementRow> {
  const { data, error } = await client
    .from("requirements")
    .insert({
      display_id: row.display_id,
      project_id: row.project_id,
      title: row.title,
      ...(row.description !== undefined
        ? { description: row.description }
        : {}),
      category: row.category,
      ...(row.business_value !== undefined
        ? { business_value: row.business_value }
        : {}),
      ...(row.customer_importance !== undefined
        ? { customer_importance: row.customer_importance }
        : {}),
      ...(row.urgency !== undefined ? { urgency: row.urgency } : {}),
      ...(row.complexity !== undefined ? { complexity: row.complexity } : {}),
      ...(row.estimated_effort !== undefined
        ? { estimated_effort: row.estimated_effort }
        : {}),
      ...(row.risk !== undefined ? { risk: row.risk } : {}),
      ...(row.story_points !== undefined
        ? { story_points: row.story_points }
        : {}),
      ...(row.dependency_id !== undefined
        ? { dependency_id: row.dependency_id }
        : {}),
      ...(row.priority !== undefined ? { priority: row.priority } : {}),
      ...(row.status !== undefined ? { status: row.status } : {}),
      ...(row.assignee_id !== undefined
        ? { assignee_id: row.assignee_id }
        : {}),
      ...(row.sprint_id !== undefined ? { sprint_id: row.sprint_id } : {}),
    })
    .select("*")
    .single();
  if (error) {
    throw toDbWriteError(error, "requirement_insert_failed");
  }
  const created = toRequirementRow(data);
  if (!created) {
    throw new DbWriteError("failed", "requirement_insert_failed");
  }
  return created;
}

/**
 * Updates one requirement through RLS. Returns the updated row, or `null`
 * when the row is not visible to the caller (missing or RLS-filtered — the
 * service pre-verifies accessibility, so `null` here means a raced deny).
 * Throws `DbWriteError` on policy/constraint failures.
 */
export async function updateRequirementById(
  client: SupabaseClient,
  requirementId: string,
  patch: RequirementPatch,
): Promise<RequirementRow | null> {
  const { data, error } = await client
    .from("requirements")
    .update({ ...patch })
    .eq("id", requirementId)
    .select("*")
    .maybeSingle();
  if (error) {
    throw toDbWriteError(error, "requirement_update_failed");
  }
  if (data === null) return null;
  const updated = toRequirementRow(data);
  if (!updated) {
    throw new DbWriteError("failed", "requirement_update_failed");
  }
  return updated;
}
