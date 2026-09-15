import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { SprintsQuery } from "@/schemas/list-queries";
import { toOffsetLimit } from "@/api/pagination";
import { findAccessibleProjectById } from "@/repositories/project.repository";
import { DbWriteError, toDbWriteError } from "@/repositories/mutation-helpers";

/**
 * Sprint data access — scoped to the authenticated caller.
 *
 * Ownership: Backend/API agent (`src/repositories/**`).
 *
 * Security: same model as `project.repository.ts` — user-scoped Supabase
 * client so RLS (`sprints_select_staff` / `sprints_select_member`) enforces
 * project→organization membership; `projectId` filters are verified
 * server-side via `findAccessibleProjectById` (inaccessible → `null` so the
 * route returns 404 without leaking existence). The unbounded
 * `getAllSprints()` is REMOVED.
 */

export interface SprintRow {
  id: string;
  project_id: string;
  name: string;
  goal: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  total_points: number | null;
  completed_points: number | null;
  created_at: string;
  updated_at: string;
}

/** Minimal projection used for server-side access verification. */
export interface AccessibleSprint {
  id: string;
  project_id: string;
}

export interface ListSprintsResult {
  rows: SprintRow[];
  total: number;
}

function toSprintRow(value: unknown): SprintRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  if (typeof row.project_id !== "string") return null;
  if (typeof row.name !== "string") return null;
  return value as SprintRow;
}

/**
 * Single sprint visible to the caller, or `null` when missing/inaccessible.
 * Used to gate `sprintId` filters on requirements/tasks: an inaccessible
 * sprint fails closed to an empty list (filter semantics, no oracle).
 */
export async function findAccessibleSprintById(
  client: SupabaseClient,
  scope: RequestScope,
  sprintId: string,
): Promise<AccessibleSprint | null> {
  if (scope.organizationIds.length === 0) return null;
  const { data, error } = await client
    .from("sprints")
    .select("id, project_id")
    .eq("id", sprintId)
    .maybeSingle();
  if (error) {
    throw new Error("sprint_lookup_failed");
  }
  if (typeof data !== "object" || data === null) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  if (typeof row.project_id !== "string") return null;
  return { id: row.id, project_id: row.project_id };
}

/**
 * Paginated sprints accessible to the caller. `projectId` scopes to one
 * accessible project (returns `null` when that project is not accessible).
 * Without `projectId`, RLS restricts rows to accessible projects; the
 * non-empty-membership pre-check keeps the intent explicit.
 */
export async function listSprintsScoped(
  client: SupabaseClient,
  scope: RequestScope,
  filters: SprintsQuery,
): Promise<ListSprintsResult | null> {
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

  const { offset, limit } = toOffsetLimit({
    page: filters.page,
    pageSize: filters.pageSize,
  });

  let query = client.from("sprints").select("*", { count: "exact" });

  if (filters.projectId !== undefined) {
    query = query.eq("project_id", filters.projectId);
  }
  if (filters.status !== undefined) {
    query = query.eq("status", filters.status);
  }

  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error("sprints_list_failed");
  }

  const rows: SprintRow[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      const row = toSprintRow(item);
      if (row) rows.push(row);
    }
  }
  return { rows, total: count ?? rows.length };
}

// ---------------------------------------------------------------------------
// Mutations (RLS-scoped writes — see `mutation-helpers.ts` for the model).
// ---------------------------------------------------------------------------

export interface SprintInsert {
  project_id: string;
  name: string;
  goal?: string | null;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  total_points?: number | null;
  completed_points?: number | null;
}

export interface SprintPatch {
  name?: string;
  goal?: string | null;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  total_points?: number | null;
  completed_points?: number | null;
}

/**
 * Full sprint row by id through the caller's RLS client, or `null` when
 * missing/invisible (no existence oracle). Used to gate mutations.
 */
export async function findSprintRowById(
  client: SupabaseClient,
  sprintId: string,
): Promise<SprintRow | null> {
  const { data, error } = await client
    .from("sprints")
    .select("*")
    .eq("id", sprintId)
    .maybeSingle();
  if (error) {
    throw new DbWriteError("failed", "sprint_lookup_failed");
  }
  return toSprintRow(data);
}

/** Inserts one sprint through RLS. Throws `DbWriteError` on failure. */
export async function insertSprint(
  client: SupabaseClient,
  row: SprintInsert,
): Promise<SprintRow> {
  const { data, error } = await client
    .from("sprints")
    .insert({
      project_id: row.project_id,
      name: row.name,
      ...(row.goal !== undefined ? { goal: row.goal } : {}),
      ...(row.status !== undefined ? { status: row.status } : {}),
      ...(row.start_date !== undefined ? { start_date: row.start_date } : {}),
      ...(row.end_date !== undefined ? { end_date: row.end_date } : {}),
      ...(row.total_points !== undefined
        ? { total_points: row.total_points }
        : {}),
      ...(row.completed_points !== undefined
        ? { completed_points: row.completed_points }
        : {}),
    })
    .select("*")
    .single();
  if (error) {
    throw toDbWriteError(error, "sprint_insert_failed");
  }
  const created = toSprintRow(data);
  if (!created) {
    throw new DbWriteError("failed", "sprint_insert_failed");
  }
  return created;
}

/**
 * Updates one sprint through RLS. Returns the updated row, or `null` when
 * the row is not visible to the caller (missing or RLS-filtered — the
 * service pre-verifies accessibility, so `null` here means a raced deny).
 * Throws `DbWriteError` on policy/constraint failures.
 */
export async function updateSprintById(
  client: SupabaseClient,
  sprintId: string,
  patch: SprintPatch,
): Promise<SprintRow | null> {
  const { data, error } = await client
    .from("sprints")
    .update({ ...patch })
    .eq("id", sprintId)
    .select("*")
    .maybeSingle();
  if (error) {
    throw toDbWriteError(error, "sprint_update_failed");
  }
  if (data === null) return null;
  const updated = toSprintRow(data);
  if (!updated) {
    throw new DbWriteError("failed", "sprint_update_failed");
  }
  return updated;
}
