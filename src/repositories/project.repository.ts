import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { ProjectsQuery } from "@/schemas/list-queries";
import {
  escapeIlikeLiteral,
  toOffsetLimit,
} from "@/api/pagination";
import { DbWriteError, toDbWriteError } from "@/repositories/mutation-helpers";

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

// ---------------------------------------------------------------------------
// Mutations (RLS-scoped writes — see `mutation-helpers.ts` for the model).
// ---------------------------------------------------------------------------

export interface ProjectInsert {
  organization_id: string;
  name: string;
  code: string;
  description?: string | null;
  client?: string | null;
  manager_id?: string | null;
  method?: string;
  status?: string;
  priority?: string;
  progress?: number;
  start_date?: string | null;
  end_date?: string | null;
  budget_total?: string | null;
  budget_currency?: string;
}

export interface ProjectPatch {
  name?: string;
  code?: string;
  description?: string | null;
  client?: string | null;
  manager_id?: string | null;
  method?: string;
  status?: string;
  priority?: string;
  progress?: number;
  start_date?: string | null;
  end_date?: string | null;
  budget_total?: string | null;
  budget_currency?: string;
}

/**
 * Full project row by id through the caller's RLS client, or `null` when
 * missing/invisible (no existence oracle). Used to gate mutations.
 */
export async function findProjectRowById(
  client: SupabaseClient,
  projectId: string,
): Promise<ProjectRow | null> {
  const { data, error } = await client
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    throw new DbWriteError("failed", "project_lookup_failed");
  }
  return toProjectRow(data);
}

/**
 * True when `code` is already taken in `orgId` (optionally ignoring one
 * project — for updates). Case-sensitive, matching the
 * `UNIQUE(organization_id, code)` index semantics.
 */
export async function isProjectCodeTaken(
  client: SupabaseClient,
  orgId: string,
  code: string,
  excludeId?: string,
): Promise<boolean> {
  let query = client
    .from("projects")
    .select("id")
    .eq("organization_id", orgId)
    .eq("code", code)
    .limit(1);
  if (excludeId !== undefined) {
    query = query.neq("id", excludeId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new DbWriteError("failed", "project_code_lookup_failed");
  }
  return data !== null;
}

function codeBaseFromName(name: string): string {
  const alnum = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (alnum.length < 2) return "PRJ";
  return alnum.slice(0, 4);
}

/**
 * Generates a per-org unique project code derived from the project name
 * (e.g. "Aurora Customer Portal" → "AURO", then "AURO-2", …).
 * The database unique index remains the final authority; callers still map
 * `unique_violation` to a 400 for the raced corner.
 */
export async function generateProjectCode(
  client: SupabaseClient,
  orgId: string,
  name: string,
): Promise<string> {
  const base = codeBaseFromName(name);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate =
      attempt === 0 ? base : `${base.slice(0, 20 - String(attempt).length - 1)}-${attempt}`;
    if (!(await isProjectCodeTaken(client, orgId, candidate))) {
      return candidate;
    }
  }
  throw new DbWriteError("failed", "project_code_generation_failed");
}

/** Inserts one project through RLS. Throws `DbWriteError` on failure. */
export async function insertProject(
  client: SupabaseClient,
  row: ProjectInsert,
): Promise<ProjectRow> {
  const { data, error } = await client
    .from("projects")
    .insert({
      organization_id: row.organization_id,
      name: row.name,
      code: row.code,
      ...(row.description !== undefined ? { description: row.description } : {}),
      ...(row.client !== undefined ? { client: row.client } : {}),
      ...(row.manager_id !== undefined ? { manager_id: row.manager_id } : {}),
      ...(row.method !== undefined ? { method: row.method } : {}),
      ...(row.status !== undefined ? { status: row.status } : {}),
      ...(row.priority !== undefined ? { priority: row.priority } : {}),
      ...(row.progress !== undefined ? { progress: row.progress } : {}),
      ...(row.start_date !== undefined ? { start_date: row.start_date } : {}),
      ...(row.end_date !== undefined ? { end_date: row.end_date } : {}),
      ...(row.budget_total !== undefined
        ? { budget_total: row.budget_total }
        : {}),
      ...(row.budget_currency !== undefined
        ? { budget_currency: row.budget_currency }
        : {}),
    })
    .select("*")
    .single();
  if (error) {
    throw toDbWriteError(error, "project_insert_failed");
  }
  const created = toProjectRow(data);
  if (!created) {
    throw new DbWriteError("failed", "project_insert_failed");
  }
  return created;
}

/**
 * Updates one project through RLS. Returns the updated row, or `null` when
 * the row is not visible to the caller (missing or RLS-filtered — the
 * service pre-verifies accessibility, so `null` here means a raced deny).
 * Throws `DbWriteError` on policy/constraint failures.
 */
export async function updateProjectById(
  client: SupabaseClient,
  projectId: string,
  patch: ProjectPatch,
): Promise<ProjectRow | null> {
  const { data, error } = await client
    .from("projects")
    .update({ ...patch })
    .eq("id", projectId)
    .select("*")
    .maybeSingle();
  if (error) {
    throw toDbWriteError(error, "project_update_failed");
  }
  if (data === null) return null;
  const updated = toProjectRow(data);
  if (!updated) {
    throw new DbWriteError("failed", "project_update_failed");
  }
  return updated;
}
