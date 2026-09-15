import type { SupabaseClient } from "@supabase/supabase-js";
import { isAppRole } from "@/types/api";

/**
 * Dashboard data access — scoped to the authenticated caller.
 *
 * Ownership: Backend/API agent (`src/repositories/**`).
 *
 * Security:
 * - Every function takes the caller's RLS-enforcing Supabase client (from
 *   `getAuthenticatedContext`), never the privileged Drizzle pool, service
 *   role, or DATABASE_URL. PostgreSQL RLS is the primary enforcement:
 *   organizations/org-members (member-only), projects/sprints/requirements/
 *   tasks (staff org-wide, developer member-project only), activity_logs
 *   (org/project/self), users (org directory + self).
 * - Explicit `organization_id` / `projects.organization_id` filters are
 *   defense-in-depth so intent is visible in code and a misconfigured policy
 *   cannot silently widen results. Client-supplied organization/user/role
 *   claims are never read.
 * - All collections are bounded (LIMIT + head counts). No SELECT * without
 *   LIMIT. Related names (managers, sprints, assignees, activity actors) are
 *   batch-fetched (1 query per relation), never N+1 per project.
 */

export interface DashboardMembership {
  organization_id: string;
  role: "ADMIN" | "PROJECT_MANAGER" | "DEVELOPER";
  created_at: string | null;
}

export interface DashboardOrganizationRow {
  id: string;
  name: string;
  slug: string;
}

export interface DashboardProjectRow {
  id: string;
  organization_id: string;
  name: string;
  client: string | null;
  manager_id: string | null;
  status: string;
  progress: number;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardSprintRow {
  id: string;
  project_id: string;
  name: string;
  status: string;
  end_date: string | null;
  updated_at: string;
}

export interface DashboardUserRow {
  id: string;
  first_name: string;
  last_name: string;
}

export interface DashboardDeadlineSprintRow {
  id: string;
  name: string;
  end_date: string | null;
  project_id: string;
  projects: { id: string; name: string } | null;
}

export interface DashboardDeadlineTaskRow {
  id: string;
  display_id: string;
  title: string;
  priority: string;
  column_status: string;
  due_date: string | null;
  project_id: string;
  assignee_id: string | null;
  projects: { id: string; name: string } | null;
}

export interface DashboardAttentionTaskRow {
  id: string;
  display_id: string;
  title: string;
  priority: string;
  column_status: string;
  project_id: string;
  assignee_id: string | null;
  updated_at: string;
  projects: { id: string; name: string } | null;
}

export interface DashboardAttentionRequirementRow {
  id: string;
  display_id: string;
  title: string;
  priority: string;
  status: string;
  project_id: string;
  assignee_id: string | null;
  updated_at: string;
  projects: { id: string; name: string } | null;
}

export interface DashboardActivityRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  project_id: string | null;
  organization_id: string | null;
  user_id: string | null;
  created_at: string;
  projects: { id: string; name: string } | null;
  actor: { id: string; first_name: string; last_name: string } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toMembership(value: unknown): DashboardMembership | null {
  if (!isRecord(value)) return null;
  if (typeof value.organization_id !== "string") return null;
  if (!isAppRole(value.role)) return null;
  const created_at =
    typeof value.created_at === "string" ? value.created_at : null;
  return {
    organization_id: value.organization_id,
    role: value.role,
    created_at,
  };
}

/**
 * Earliest membership (ORDER BY created_at ASC) determines the primary
 * organization. This mirrors the provisioning lane's earliest-wins rule
 * (`ensureUserProvisionedServerOnly` orders by created_at ASC and returns
 * the first membership) without inventing a client-selectable org switcher.
 * RLS restricts rows to memberships visible to the caller.
 */
export async function fetchPrimaryMembership(
  client: SupabaseClient,
  userId: string,
): Promise<DashboardMembership | null> {
  const { data, error } = await client
    .from("organization_members")
    .select("organization_id,role,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("organization_id", { ascending: true })
    .limit(10);
  if (error) throw error;
  if (!Array.isArray(data)) return null;
  for (const item of data) {
    const row = toMembership(item);
    if (row) return row;
  }
  return null;
}

export async function fetchOrganizationById(
  client: SupabaseClient,
  organizationId: string,
): Promise<DashboardOrganizationRow | null> {
  const { data, error } = await client
    .from("organizations")
    .select("id,name,slug")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!isRecord(data)) return null;
  if (
    typeof data.id !== "string" ||
    typeof data.name !== "string" ||
    typeof data.slug !== "string"
  ) {
    return null;
  }
  return { id: data.id, name: data.name, slug: data.slug };
}

function toProjectRow(value: unknown): DashboardProjectRow | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string") return null;
  if (typeof value.organization_id !== "string") return null;
  if (typeof value.name !== "string") return null;
  if (typeof value.status !== "string") return null;
  return {
    id: value.id,
    organization_id: value.organization_id,
    name: value.name,
    client: typeof value.client === "string" ? value.client : null,
    manager_id: typeof value.manager_id === "string" ? value.manager_id : null,
    status: value.status,
    progress: typeof value.progress === "number" ? value.progress : 0,
    end_date: typeof value.end_date === "string" ? value.end_date : null,
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
  };
}

const PROJECT_SELECT =
  "id,organization_id,name,client,manager_id,status,progress,end_date,created_at,updated_at";

export async function fetchRecentProjects(
  client: SupabaseClient,
  organizationId: string,
  limit: number,
): Promise<DashboardProjectRow[]> {
  const { data, error } = await client
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const rows: DashboardProjectRow[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      const row = toProjectRow(item);
      if (row) rows.push(row);
    }
  }
  return rows;
}

export async function fetchActiveProjects(
  client: SupabaseClient,
  organizationId: string,
  limit: number,
): Promise<DashboardProjectRow[]> {
  const { data, error } = await client
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const rows: DashboardProjectRow[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      const row = toProjectRow(item);
      if (row) rows.push(row);
    }
  }
  return rows;
}

export async function countProjects(
  client: SupabaseClient,
  organizationId: string,
  status?: string,
  createdSinceIso?: string,
): Promise<number> {
  let query = client
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (status !== undefined) query = query.eq("status", status);
  if (createdSinceIso !== undefined)
    query = query.gte("created_at", createdSinceIso);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function countOrganizationMembers(
  client: SupabaseClient,
  organizationId: string,
  createdSinceIso?: string,
): Promise<number> {
  let query = client
    .from("organization_members")
    .select("organization_id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (createdSinceIso !== undefined)
    query = query.gte("created_at", createdSinceIso);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function toSprintRow(value: unknown): DashboardSprintRow | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string") return null;
  if (typeof value.project_id !== "string") return null;
  if (typeof value.name !== "string") return null;
  return {
    id: value.id,
    project_id: value.project_id,
    name: value.name,
    status: typeof value.status === "string" ? value.status : "",
    end_date: typeof value.end_date === "string" ? value.end_date : null,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
  };
}

/**
 * Single batched sprint lookup for a set of project ids (avoids N+1).
 * RLS (`sprints_select_staff` / `sprints_select_member`) still applies.
 */
export async function fetchSprintsForProjects(
  client: SupabaseClient,
  projectIds: string[],
): Promise<DashboardSprintRow[]> {
  if (projectIds.length === 0) return [];
  const unique = [...new Set(projectIds)].slice(0, 50);
  const { data, error } = await client
    .from("sprints")
    .select("id,project_id,name,status,end_date,updated_at")
    .in("project_id", unique)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows: DashboardSprintRow[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      const row = toSprintRow(item);
      if (row) rows.push(row);
    }
  }
  return rows;
}

function toUserRow(value: unknown): DashboardUserRow | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string") return null;
  return {
    id: value.id,
    first_name: typeof value.first_name === "string" ? value.first_name : "",
    last_name: typeof value.last_name === "string" ? value.last_name : "",
  };
}

/** Single batched user lookup (managers, assignees, activity actors). */
export async function fetchUsersByIds(
  client: SupabaseClient,
  userIds: string[],
): Promise<Map<string, DashboardUserRow>> {
  const out = new Map<string, DashboardUserRow>();
  const unique = [...new Set(userIds.filter((id) => id.length > 0))].slice(
    0,
    100,
  );
  if (unique.length === 0) return out;
  const { data, error } = await client
    .from("users")
    .select("id,first_name,last_name")
    .in("id", unique)
    .limit(100);
  if (error) throw error;
  if (Array.isArray(data)) {
    for (const item of data) {
      const row = toUserRow(item);
      if (row) out.set(row.id, row);
    }
  }
  return out;
}

function toEmbeddedProject(value: unknown): { id: string; name: string } | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.name !== "string")
    return null;
  return { id: value.id, name: value.name };
}

const SPRINT_DEADLINE_SELECT =
  "id,name,end_date,project_id,projects!inner(id,name,organization_id)";

export async function fetchUpcomingSprints(
  client: SupabaseClient,
  organizationId: string,
  fromDate: string,
  toDate: string | null,
  limit: number,
): Promise<DashboardDeadlineSprintRow[]> {
  let query = client
    .from("sprints")
    .select(SPRINT_DEADLINE_SELECT)
    .eq("projects.organization_id", organizationId)
    .not("end_date", "is", null)
    .gte("end_date", fromDate)
    .order("end_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (toDate !== null) query = query.lte("end_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  const rows: DashboardDeadlineSprintRow[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!isRecord(item)) continue;
      if (typeof item.id !== "string") continue;
      if (typeof item.name !== "string") continue;
      if (typeof item.project_id !== "string") continue;
      rows.push({
        id: item.id,
        name: item.name,
        end_date: typeof item.end_date === "string" ? item.end_date : null,
        project_id: item.project_id,
        projects: toEmbeddedProject(item.projects),
      });
    }
  }
  return rows;
}

export async function countUpcomingSprints(
  client: SupabaseClient,
  organizationId: string,
  fromDate: string,
  toDate: string | null,
): Promise<number> {
  let query = client
    .from("sprints")
    .select("id", { count: "exact", head: true })
    .eq("projects.organization_id", organizationId)
    .not("end_date", "is", null)
    .gte("end_date", fromDate);
  // PostgREST join filter requires the inner join in the SELECT; for head
  // counts the SELECT list still declares it so the eq() path resolves.
  // Rebuild with the join select when the plain head query is rejected by
  // falling back below — keep the simple form first for readability.
  if (toDate !== null) query = query.lte("end_date", toDate);
  const { count, error } = await query;
  if (error) {
    // Fallback: same predicate with explicit inner-join select (some
    // PostgREST versions require the join to appear in SELECT for head).
    let retry = client
      .from("sprints")
      .select(SPRINT_DEADLINE_SELECT, { count: "exact", head: true })
      .eq("projects.organization_id", organizationId)
      .not("end_date", "is", null)
      .gte("end_date", fromDate);
    if (toDate !== null) retry = retry.lte("end_date", toDate);
    const second = await retry;
    if (second.error) throw second.error;
    return second.count ?? 0;
  }
  return count ?? 0;
}

const TASK_DEADLINE_SELECT =
  "id,display_id,title,priority,column_status,due_date,project_id,assignee_id,projects!inner(id,name,organization_id)";

export async function fetchUpcomingTasks(
  client: SupabaseClient,
  organizationId: string,
  fromDate: string,
  toDate: string | null,
  limit: number,
): Promise<DashboardDeadlineTaskRow[]> {
  let query = client
    .from("tasks")
    .select(TASK_DEADLINE_SELECT)
    .eq("projects.organization_id", organizationId)
    .not("due_date", "is", null)
    .gte("due_date", fromDate)
    .order("due_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (toDate !== null) query = query.lte("due_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  const rows: DashboardDeadlineTaskRow[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!isRecord(item)) continue;
      if (typeof item.id !== "string") continue;
      if (typeof item.title !== "string") continue;
      if (typeof item.project_id !== "string") continue;
      rows.push({
        id: item.id,
        display_id:
          typeof item.display_id === "string" ? item.display_id : item.id,
        title: item.title,
        priority: typeof item.priority === "string" ? item.priority : "medium",
        column_status:
          typeof item.column_status === "string" ? item.column_status : "",
        due_date: typeof item.due_date === "string" ? item.due_date : null,
        project_id: item.project_id,
        assignee_id:
          typeof item.assignee_id === "string" ? item.assignee_id : null,
        projects: toEmbeddedProject(item.projects),
      });
    }
  }
  return rows;
}

export async function countUpcomingTasks(
  client: SupabaseClient,
  organizationId: string,
  fromDate: string,
  toDate: string | null,
): Promise<number> {
  let query = client
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("projects.organization_id", organizationId)
    .not("due_date", "is", null)
    .gte("due_date", fromDate);
  if (toDate !== null) query = query.lte("due_date", toDate);
  const { count, error } = await query;
  if (error) {
    let retry = client
      .from("tasks")
      .select(TASK_DEADLINE_SELECT, { count: "exact", head: true })
      .eq("projects.organization_id", organizationId)
      .not("due_date", "is", null)
      .gte("due_date", fromDate);
    if (toDate !== null) retry = retry.lte("due_date", toDate);
    const second = await retry;
    if (second.error) throw second.error;
    return second.count ?? 0;
  }
  return count ?? 0;
}

const ATTENTION_TASK_SELECT =
  "id,display_id,title,priority,column_status,project_id,assignee_id,updated_at,projects!inner(id,name,organization_id)";

/**
 * Tasks needing attention: column_status IN (review, testing). Uses only the
 * existing task_column_status enum — no new severity system.
 */
export async function fetchAttentionTasks(
  client: SupabaseClient,
  organizationId: string,
  limit: number,
): Promise<DashboardAttentionTaskRow[]> {
  const { data, error } = await client
    .from("tasks")
    .select(ATTENTION_TASK_SELECT)
    .eq("projects.organization_id", organizationId)
    .in("column_status", ["review", "testing"])
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const rows: DashboardAttentionTaskRow[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!isRecord(item)) continue;
      if (typeof item.id !== "string") continue;
      if (typeof item.title !== "string") continue;
      if (typeof item.project_id !== "string") continue;
      rows.push({
        id: item.id,
        display_id:
          typeof item.display_id === "string" ? item.display_id : item.id,
        title: item.title,
        priority: typeof item.priority === "string" ? item.priority : "medium",
        column_status:
          typeof item.column_status === "string" ? item.column_status : "",
        project_id: item.project_id,
        assignee_id:
          typeof item.assignee_id === "string" ? item.assignee_id : null,
        updated_at:
          typeof item.updated_at === "string" ? item.updated_at : "",
        projects: toEmbeddedProject(item.projects),
      });
    }
  }
  return rows;
}

export async function countAttentionTasks(
  client: SupabaseClient,
  organizationId: string,
  onlyHighPriority: boolean,
): Promise<number> {
  let query = client
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("projects.organization_id", organizationId)
    .in("column_status", ["review", "testing"]);
  if (onlyHighPriority) query = query.eq("priority", "high");
  const { count, error } = await query;
  if (error) {
    let retry = client
      .from("tasks")
      .select(ATTENTION_TASK_SELECT, { count: "exact", head: true })
      .eq("projects.organization_id", organizationId)
      .in("column_status", ["review", "testing"]);
    if (onlyHighPriority) retry = retry.eq("priority", "high");
    const second = await retry;
    if (second.error) throw second.error;
    return second.count ?? 0;
  }
  return count ?? 0;
}

const ATTENTION_REQUIREMENT_SELECT =
  "id,display_id,title,priority,status,project_id,assignee_id,updated_at,projects!inner(id,name,organization_id)";

/**
 * Requirements needing attention: status IN (pending, blocked). Uses only
 * the existing requirement_status enum.
 */
export async function fetchAttentionRequirements(
  client: SupabaseClient,
  organizationId: string,
  limit: number,
): Promise<DashboardAttentionRequirementRow[]> {
  const { data, error } = await client
    .from("requirements")
    .select(ATTENTION_REQUIREMENT_SELECT)
    .eq("projects.organization_id", organizationId)
    .in("status", ["pending", "blocked"])
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const rows: DashboardAttentionRequirementRow[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!isRecord(item)) continue;
      if (typeof item.id !== "string") continue;
      if (typeof item.title !== "string") continue;
      if (typeof item.project_id !== "string") continue;
      rows.push({
        id: item.id,
        display_id:
          typeof item.display_id === "string" ? item.display_id : item.id,
        title: item.title,
        priority: typeof item.priority === "string" ? item.priority : "medium",
        status: typeof item.status === "string" ? item.status : "",
        project_id: item.project_id,
        assignee_id:
          typeof item.assignee_id === "string" ? item.assignee_id : null,
        updated_at:
          typeof item.updated_at === "string" ? item.updated_at : "",
        projects: toEmbeddedProject(item.projects),
      });
    }
  }
  return rows;
}

export async function countAttentionRequirements(
  client: SupabaseClient,
  organizationId: string,
  onlyHighPriority: boolean,
): Promise<number> {
  let query = client
    .from("requirements")
    .select("id", { count: "exact", head: true })
    .eq("projects.organization_id", organizationId)
    .in("status", ["pending", "blocked"]);
  if (onlyHighPriority) query = query.eq("priority", "high");
  const { count, error } = await query;
  if (error) {
    let retry = client
      .from("requirements")
      .select(ATTENTION_REQUIREMENT_SELECT, { count: "exact", head: true })
      .eq("projects.organization_id", organizationId)
      .in("status", ["pending", "blocked"]);
    if (onlyHighPriority) retry = retry.eq("priority", "high");
    const second = await retry;
    if (second.error) throw second.error;
    return second.count ?? 0;
  }
  return count ?? 0;
}

const ACTIVITY_SELECT =
  "id,action,entity_type,entity_id,project_id,organization_id,user_id,created_at,projects:projects!activity_logs_project_id_fkey(id,name),actor:users!activity_logs_user_id_fkey(id,first_name,last_name)";

/**
 * Recent activity from `activity_logs`, scoped to the primary organization
 * (`organization_id = primaryOrgId`). RLS (`activity_logs_select_member`)
 * remains the primary enforcement; the explicit org filter is
 * defense-in-depth and guarantees a multi-org caller never sees foreign-org
 * rows here. Rows with NULL organization_id are conservatively excluded
 * (fail-closed) rather than joined across orgs.
 */
export async function fetchRecentActivity(
  client: SupabaseClient,
  organizationId: string,
  limit: number,
): Promise<DashboardActivityRow[]> {
  const { data, error } = await client
    .from("activity_logs")
    .select(ACTIVITY_SELECT)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const rows: DashboardActivityRow[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!isRecord(item)) continue;
      if (typeof item.id !== "string") continue;
      if (typeof item.action !== "string") continue;
      if (typeof item.created_at !== "string") continue;
      let projects: { id: string; name: string } | null = null;
      if (isRecord(item.projects)) {
        const p = item.projects;
        if (typeof p.id === "string" && typeof p.name === "string") {
          projects = { id: p.id, name: p.name };
        }
      }
      let actor: {
        id: string;
        first_name: string;
        last_name: string;
      } | null = null;
      if (isRecord(item.actor)) {
        const a = item.actor;
        if (typeof a.id === "string") {
          actor = {
            id: a.id,
            first_name: typeof a.first_name === "string" ? a.first_name : "",
            last_name: typeof a.last_name === "string" ? a.last_name : "",
          };
        }
      }
      rows.push({
        id: item.id,
        action: item.action,
        entity_type:
          typeof item.entity_type === "string" ? item.entity_type : null,
        entity_id: typeof item.entity_id === "string" ? item.entity_id : null,
        project_id:
          typeof item.project_id === "string" ? item.project_id : null,
        organization_id:
          typeof item.organization_id === "string"
            ? item.organization_id
            : null,
        user_id: typeof item.user_id === "string" ? item.user_id : null,
        created_at: item.created_at,
        projects,
        actor,
      });
    }
  }
  return rows;
}
