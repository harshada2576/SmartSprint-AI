import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { TasksQuery } from "@/schemas/list-queries";
import { toOffsetLimit } from "@/api/pagination";
import { findAccessibleProjectById } from "@/repositories/project.repository";
import { findAccessibleSprintById } from "@/repositories/sprint.repository";
import { DbWriteError, toDbWriteError } from "@/repositories/mutation-helpers";

/**
 * Task data access — scoped to the authenticated caller.
 *
 * Ownership: Backend/API agent (`src/repositories/**`).
 *
 * Security: same model as `project.repository.ts` — user-scoped Supabase
 * client so RLS (`tasks_select_staff` / `tasks_select_member`) enforces
 * project→organization membership. `projectId` is verified server-side
 * (inaccessible → `null` → route 404, no existence oracle). `sprintId` is
 * verified the same way but fails closed to an empty list. The `assignee`
 * filter only narrows rows RLS already permits — it can never broaden
 * visibility, so a developer cannot use it to pull arbitrary
 * organization/project task data.
 *
 * Developer boundary (mirrors the RLS `tasks_update_dev_self` rule):
 * - Reads: developers see tasks in member projects (RLS floor). No additional
 *   read restriction is imposed — filtering by another user's id still only
 *   returns rows inside the caller's accessible projects.
 * - Writes/claims: deliberately NOT implemented here. There is no generic
 *   "claim task" mechanism; developers cannot self-assign unassigned or
 *   peer tasks (RLS pins `assignee_id = auth.uid()` on both sides of any
 *   developer update, and no DEVELOPER INSERT policy exists).
 *
 * Caller-scoped reads (`?assignee=me`): the route resolves `me` to the
 * verified `auth.uid()` before calling here, but this repository
 * defensively re-resolves any residual `assigneeSelf: true` to
 * `scope.userId` (server-derived membership scope, never a client value).
 * Identity for the `me` path therefore always comes from the authenticated
 * session; RLS (`tasks_select_staff` / `tasks_select_member`) remains the
 * constraining floor on the user-scoped client.
 *
 * The unbounded `getAllTasks()` is REMOVED.
 */

export interface TaskRow {
  id: string;
  display_id: string;
  sprint_id: string | null;
  requirement_id: string | null;
  project_id: string;
  title: string;
  description: string | null;
  priority: string;
  points: number | null;
  assignee_id: string | null;
  column_status: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListTasksResult {
  rows: TaskRow[];
  total: number;
}

function toTaskRow(value: unknown): TaskRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  if (typeof row.project_id !== "string") return null;
  if (typeof row.title !== "string") return null;
  return value as TaskRow;
}

/**
 * Paginated tasks accessible to the caller.
 * Returns `null` only when `projectId` names an inaccessible project
 * (route maps to 404). All other scoping failures yield an empty list.
 */
export async function listTasksScoped(
  client: SupabaseClient,
  scope: RequestScope,
  filters: TasksQuery,
): Promise<ListTasksResult | null> {
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
  // projectId is also given; otherwise fail closed with an empty list.
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

  let query = client.from("tasks").select("*", { count: "exact" });

  if (filters.projectId !== undefined) {
    query = query.eq("project_id", filters.projectId);
  }
  if (filters.sprintId !== undefined) {
    query = query.eq("sprint_id", filters.sprintId);
  }
  if (filters.status !== undefined) {
    query = query.eq("column_status", filters.status);
  }
  // `assigneeSelf` is server-resolved: the route normally strips it already,
  // but resolve here too so no caller can smuggle a foreign identity through
  // the `me` path. `scope.userId` is the verified auth.uid().
  const effectiveAssigneeId = filters.assigneeSelf
    ? scope.userId
    : filters.assigneeId;
  if (effectiveAssigneeId !== undefined) {
    query = query.eq("assignee_id", effectiveAssigneeId);
  }

  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error("tasks_list_failed");
  }

  const rows: TaskRow[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      const row = toTaskRow(item);
      if (row) rows.push(row);
    }
  }
  return { rows, total: count ?? rows.length };
}

// ---------------------------------------------------------------------------
// Mutations (RLS-scoped writes — see `mutation-helpers.ts` for the model).
// ---------------------------------------------------------------------------

export interface TaskInsert {
  display_id: string;
  project_id: string;
  title: string;
  description?: string | null;
  priority?: string;
  points?: number | null;
  assignee_id?: string | null;
  sprint_id?: string | null;
  requirement_id?: string | null;
  column_status?: string;
  due_date?: string | null;
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  priority?: string;
  points?: number | null;
  assignee_id?: string | null;
  sprint_id?: string | null;
  requirement_id?: string | null;
  column_status?: string;
  due_date?: string | null;
}

/** Minimal projection for same-project linkage checks. */
export interface LinkedTask {
  id: string;
  project_id: string;
}

/**
 * Full task row by id through the caller's RLS client, or `null` when
 * missing/invisible (no existence oracle). Used to gate mutations.
 */
export async function findTaskRowById(
  client: SupabaseClient,
  taskId: string,
): Promise<TaskRow | null> {
  const { data, error } = await client
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();
  if (error) {
    throw new DbWriteError("failed", "task_lookup_failed");
  }
  return toTaskRow(data);
}

/** Linkage projection for same-project checks. */
export async function findLinkedTaskById(
  client: SupabaseClient,
  taskId: string,
): Promise<LinkedTask | null> {
  const { data, error } = await client
    .from("tasks")
    .select("id, project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error) {
    throw new DbWriteError("failed", "task_lookup_failed");
  }
  if (typeof data !== "object" || data === null) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  if (typeof row.project_id !== "string") return null;
  return { id: row.id, project_id: row.project_id };
}

/** Exact count of tasks in a project (for display-ID sequencing). */
export async function countTasksInProject(
  client: SupabaseClient,
  projectId: string,
): Promise<number> {
  const { count, error } = await client
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (error) {
    throw new DbWriteError("failed", "task_count_failed");
  }
  return count ?? 0;
}

/** True when `displayId` is already taken in `projectId`. */
export async function isTaskDisplayIdTaken(
  client: SupabaseClient,
  projectId: string,
  displayId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("tasks")
    .select("id")
    .eq("project_id", projectId)
    .eq("display_id", displayId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new DbWriteError("failed", "task_display_lookup_failed");
  }
  return data !== null;
}

/**
 * Generates the next project-scoped display ID (`TASK-001`-style).
 * The `UNIQUE(project_id, display_id)` constraint remains the final
 * authority; callers retry on `unique_violation`.
 */
export async function generateTaskDisplayId(
  client: SupabaseClient,
  projectId: string,
  sequenceHint: number,
): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const sequence = sequenceHint + attempt;
    const candidate = `TASK-${String(sequence).padStart(3, "0")}`;
    if (!(await isTaskDisplayIdTaken(client, projectId, candidate))) {
      return candidate;
    }
  }
  throw new DbWriteError("failed", "task_display_generation_failed");
}

/** Inserts one task through RLS. Throws `DbWriteError` on failure. */
export async function insertTask(
  client: SupabaseClient,
  row: TaskInsert,
): Promise<TaskRow> {
  const { data, error } = await client
    .from("tasks")
    .insert({
      display_id: row.display_id,
      project_id: row.project_id,
      title: row.title,
      ...(row.description !== undefined
        ? { description: row.description }
        : {}),
      ...(row.priority !== undefined ? { priority: row.priority } : {}),
      ...(row.points !== undefined ? { points: row.points } : {}),
      ...(row.assignee_id !== undefined
        ? { assignee_id: row.assignee_id }
        : {}),
      ...(row.sprint_id !== undefined ? { sprint_id: row.sprint_id } : {}),
      ...(row.requirement_id !== undefined
        ? { requirement_id: row.requirement_id }
        : {}),
      ...(row.column_status !== undefined
        ? { column_status: row.column_status }
        : {}),
      ...(row.due_date !== undefined ? { due_date: row.due_date } : {}),
    })
    .select("*")
    .single();
  if (error) {
    throw toDbWriteError(error, "task_insert_failed");
  }
  const created = toTaskRow(data);
  if (!created) {
    throw new DbWriteError("failed", "task_insert_failed");
  }
  return created;
}

/**
 * Updates one task through RLS. Returns the updated row, or `null` when
 * the row is not visible to the caller (missing or RLS-filtered — the
 * service pre-verifies accessibility, so `null` here means a raced deny).
 * Throws `DbWriteError` on policy/constraint failures.
 */
export async function updateTaskById(
  client: SupabaseClient,
  taskId: string,
  patch: TaskPatch,
): Promise<TaskRow | null> {
  const { data, error } = await client
    .from("tasks")
    .update({ ...patch })
    .eq("id", taskId)
    .select("*")
    .maybeSingle();
  if (error) {
    throw toDbWriteError(error, "task_update_failed");
  }
  if (data === null) return null;
  const updated = toTaskRow(data);
  if (!updated) {
    throw new DbWriteError("failed", "task_update_failed");
  }
  return updated;
}
