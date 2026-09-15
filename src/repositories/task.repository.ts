import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { TasksQuery } from "@/schemas/list-queries";
import { toOffsetLimit } from "@/utils/api-response";
import { findAccessibleProjectById } from "@/repositories/project.repository";
import { findAccessibleSprintById } from "@/repositories/sprint.repository";

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
  if (filters.assigneeId !== undefined) {
    query = query.eq("assignee_id", filters.assigneeId);
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
