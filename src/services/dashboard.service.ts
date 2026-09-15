import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardResponse } from "@/lib/api-mapping";
import {
  countAttentionRequirements,
  countAttentionTasks,
  countOrganizationMembers,
  countProjects,
  countUpcomingSprints,
  countUpcomingTasks,
  fetchActiveProjects,
  fetchAttentionRequirements,
  fetchAttentionTasks,
  fetchOrganizationById,
  fetchPrimaryMembership,
  fetchRecentActivity,
  fetchRecentProjects,
  fetchSprintsForProjects,
  fetchUpcomingSprints,
  fetchUpcomingTasks,
  fetchUsersByIds,
  type DashboardProjectRow,
  type DashboardSprintRow,
} from "@/repositories/dashboard.repository";

/**
 * Dashboard service — assembles GET /api/dashboard from RLS-scoped reads.
 *
 * Ownership: Backend/API agent (`src/services/**`).
 *
 * Contract: returns exactly `DashboardResponse["data"]` (see
 * `src/lib/api-mapping.ts` + `src/lib/dashboard-api.ts` normalizers). No
 * mock numbers, no hardcoded demo values, no random values — every number
 * is a live COUNT or list length from the authenticated client's visible
 * rows. Derived progress is read from `projects.progress` (never persisted
 * here). No privileged Drizzle/service-role access.
 */

export class DashboardForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor(message = "Insufficient permissions") {
    super(message);
    this.name = "DashboardForbiddenError";
  }
}

export type DashboardData = DashboardResponse["data"];

const RECENT_PROJECTS_LIMIT = 5;
const ACTIVE_PROJECTS_LIMIT = 10;
const DEADLINES_LIMIT = 10;
const ATTENTION_PER_KIND_LIMIT = 5;
const ATTENTION_LIMIT = 10;
const ACTIVITY_LIMIT = 10;

function toUtcDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toIsoOrEmpty(value: string): string {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  return new Date(time).toISOString();
}

/** "2025-10-12" (date) -> "2025-10-12T00:00:00.000Z" for the API contract. */
function dateOnlyToIso(dateOnly: string | null): string {
  if (!dateOnly) return "";
  const time = new Date(`${dateOnly}T00:00:00.000Z`).getTime();
  if (Number.isNaN(time)) return "";
  return new Date(time).toISOString();
}

function daysRemaining(fromIso: string): number | undefined {
  const time = new Date(fromIso).getTime();
  if (Number.isNaN(time)) return undefined;
  const now = Date.now();
  const diff = Math.ceil((time - now) / 86_400_000);
  return diff >= 0 ? diff : 0;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim().replace(/\s+/g, " ");
}

function normalizePriority(value: string): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

/**
 * Current sprint per project: prefer the most recently updated `active`
 * sprint, else the most recently updated `planning` sprint, else the most
 * recently updated sprint of any status. Single batched input — no N+1.
 */
function pickCurrentSprint(
  sprints: DashboardSprintRow[],
  projectId: string,
): DashboardSprintRow | null {
  const forProject = sprints.filter((s) => s.project_id === projectId);
  if (forProject.length === 0) return null;
  const active = forProject.find((s) => s.status === "active");
  if (active) return active;
  const planning = forProject.find((s) => s.status === "planning");
  if (planning) return planning;
  return forProject[0] ?? null;
}

function projectNameById(
  projects: DashboardProjectRow[],
  projectId: string,
): string {
  return projects.find((p) => p.id === projectId)?.name ?? "";
}

/**
 * Loads the dashboard for the verified caller.
 *
 * - Identity comes only from `userId` (the verified `auth.getUser()` sub).
 * - Organization context is the caller's earliest membership (created_at
 *   ASC), mirroring provisioning's earliest-wins rule. `?organizationId=`
 *   (any spelling) is never read, so a foreign-org id cannot switch scope.
 * - Throws DashboardForbiddenError when the caller has no visible
 *   membership/organization (fail-closed). All other failures throw and the
 *   route maps them to generic INTERNAL_ERROR ("Unable to load dashboard").
 */
export async function getDashboardData(
  client: SupabaseClient,
  userId: string,
): Promise<DashboardData> {
  const membership = await fetchPrimaryMembership(client, userId);
  if (!membership) {
    throw new DashboardForbiddenError();
  }
  const organizationId = membership.organization_id;

  const organization = await fetchOrganizationById(client, organizationId);
  if (!organization) {
    // Visible membership but org row not visible (RLS) or missing — treat
    // as forbidden without distinguishing (no existence oracle).
    throw new DashboardForbiddenError();
  }

  const now = new Date();
  const today = toUtcDateOnly(now);
  const sevenDaysAgoIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const next7 = toUtcDateOnly(new Date(now.getTime() + 7 * 86_400_000));
  const next14 = toUtcDateOnly(new Date(now.getTime() + 14 * 86_400_000));

  const [
    recentProjects,
    activeProjects,
    activeCount,
    activeNewWeek,
    teamCount,
    teamNewWeek,
    sprintsNext14,
    sprintsNext7,
    tasksNext14,
    tasksNext7,
    upcomingSprints,
    upcomingTasks,
    attentionTasks,
    attentionRequirements,
    attentionTaskCount,
    attentionTaskHigh,
    attentionReqCount,
    attentionReqHigh,
    activityRows,
  ] = await Promise.all([
    fetchRecentProjects(client, organizationId, RECENT_PROJECTS_LIMIT),
    fetchActiveProjects(client, organizationId, ACTIVE_PROJECTS_LIMIT),
    countProjects(client, organizationId, "active"),
    countProjects(client, organizationId, "active", sevenDaysAgoIso),
    countOrganizationMembers(client, organizationId),
    countOrganizationMembers(client, organizationId, sevenDaysAgoIso),
    countUpcomingSprints(client, organizationId, today, next14),
    countUpcomingSprints(client, organizationId, today, next7),
    countUpcomingTasks(client, organizationId, today, next14),
    countUpcomingTasks(client, organizationId, today, next7),
    fetchUpcomingSprints(client, organizationId, today, next14, DEADLINES_LIMIT),
    fetchUpcomingTasks(client, organizationId, today, next14, DEADLINES_LIMIT),
    fetchAttentionTasks(client, organizationId, ATTENTION_PER_KIND_LIMIT),
    fetchAttentionRequirements(
      client,
      organizationId,
      ATTENTION_PER_KIND_LIMIT,
    ),
    countAttentionTasks(client, organizationId, false),
    countAttentionTasks(client, organizationId, true),
    countAttentionRequirements(client, organizationId, false),
    countAttentionRequirements(client, organizationId, true),
    fetchRecentActivity(client, organizationId, ACTIVITY_LIMIT),
  ]);

  // Batch related names: one sprint query for recent+active projects, one
  // user query for managers + assignees + activity actors.
  const projectIds = [
    ...recentProjects.map((p) => p.id),
    ...activeProjects.map((p) => p.id),
  ];
  const sprintsForProjects = await fetchSprintsForProjects(client, projectIds);

  const userIds: string[] = [];
  for (const p of [...recentProjects, ...activeProjects]) {
    if (p.manager_id) userIds.push(p.manager_id);
  }
  for (const t of attentionTasks) {
    if (t.assignee_id) userIds.push(t.assignee_id);
  }
  for (const r of attentionRequirements) {
    if (r.assignee_id) userIds.push(r.assignee_id);
  }
  for (const a of activityRows) {
    if (a.user_id) userIds.push(a.user_id);
  }
  const usersById = await fetchUsersByIds(client, userIds);
  const userDisplayName = (id: string | null): string => {
    if (!id) return "";
    const row = usersById.get(id);
    if (!row) return "";
    return fullName(row.first_name, row.last_name);
  };

  const recentProjectsData: DashboardData["recentProjects"] = recentProjects.map(
    (p) => {
      const sprint = pickCurrentSprint(sprintsForProjects, p.id);
      const managerName = userDisplayName(p.manager_id);
      return {
        id: p.id,
        name: p.name,
        client: p.client ?? "",
        status: p.status,
        progress: clampProgress(p.progress),
        updatedAt: toIsoOrEmpty(p.updated_at || p.created_at),
        ...(p.manager_id
          ? {
              manager: {
                id: p.manager_id,
                name: managerName || "Unassigned",
              },
            }
          : managerName
            ? { manager: { id: "", name: managerName } }
            : {}),
        ...(sprint
          ? { currentSprint: { id: sprint.id, name: sprint.name } }
          : {}),
      };
    },
  );

  const activeProjectsData: DashboardData["activeProjects"] = activeProjects.map(
    (p) => {
      const sprint = pickCurrentSprint(sprintsForProjects, p.id);
      const managerName = userDisplayName(p.manager_id);
      return {
        id: p.id,
        name: p.name,
        client: p.client ?? "",
        manager: {
          id: p.manager_id ?? "",
          name: managerName || "Unassigned",
        },
        status: p.status,
        progress: clampProgress(p.progress),
        currentSprint: sprint
          ? { id: sprint.id, name: sprint.name }
          : { id: "", name: "" },
        endDate: p.end_date ? dateOnlyToIso(p.end_date) : "",
      };
    },
  );

  const upcomingDeadlines: DashboardData["upcomingDeadlines"] = [
    ...upcomingSprints.map((s) => {
      const dueDate = dateOnlyToIso(s.end_date);
      const projectName =
        s.projects?.name ?? projectNameById(recentProjects, s.project_id);
      return {
        kind: "sprint" as const,
        id: s.id,
        title: s.name,
        project: { id: s.projects?.id ?? s.project_id, name: projectName },
        dueDate,
        ...(dueDate
          ? (() => {
              const remaining = daysRemaining(dueDate);
              return remaining !== undefined ? { daysRemaining: remaining } : {};
            })()
          : {}),
      };
    }),
    ...upcomingTasks.map((t) => {
      const dueDate = dateOnlyToIso(t.due_date);
      const projectName =
        t.projects?.name ?? projectNameById(recentProjects, t.project_id);
      return {
        kind: "task" as const,
        id: t.id,
        title: t.title,
        project: { id: t.projects?.id ?? t.project_id, name: projectName },
        dueDate,
        ...(dueDate
          ? (() => {
              const remaining = daysRemaining(dueDate);
              return remaining !== undefined ? { daysRemaining: remaining } : {};
            })()
          : {}),
      };
    }),
  ]
    .filter((d) => d.dueDate.length > 0)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
    .slice(0, DEADLINES_LIMIT);

  const attentionItems: DashboardData["attentionItems"] = [
    ...attentionTasks.map((t) => ({
      kind: "task" as const,
      id: t.id,
      displayId: t.display_id,
      title: t.title,
      priority: normalizePriority(t.priority),
      status: t.column_status,
      project: {
        id: t.projects?.id ?? t.project_id,
        name: t.projects?.name ?? projectNameById(recentProjects, t.project_id),
      },
      ...(t.assignee_id
        ? (() => {
            const name = userDisplayName(t.assignee_id);
            return name
              ? { assignee: { id: t.assignee_id as string, name } }
              : {};
          })()
        : {}),
      updatedAt: t.updated_at,
    })),
    ...attentionRequirements.map((r) => ({
      kind: "requirement" as const,
      id: r.id,
      displayId: r.display_id,
      title: r.title,
      priority: normalizePriority(r.priority),
      status: r.status,
      project: {
        id: r.projects?.id ?? r.project_id,
        name: r.projects?.name ?? projectNameById(recentProjects, r.project_id),
      },
      ...(r.assignee_id
        ? (() => {
            const name = userDisplayName(r.assignee_id);
            return name
              ? { assignee: { id: r.assignee_id as string, name } }
              : {};
          })()
        : {}),
      updatedAt: r.updated_at,
    })),
  ]
    .sort((a, b) => {
      const rank = (p: string): number =>
        p === "high" ? 0 : p === "medium" ? 1 : 2;
      const byPriority = rank(a.priority) - rank(b.priority);
      if (byPriority !== 0) return byPriority;
      if (a.updatedAt && b.updatedAt) {
        return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
      }
      return 0;
    })
    .slice(0, ATTENTION_LIMIT)
    .map(({ updatedAt: _omitted, ...rest }) => rest);

  // Frontend contract expects numeric ids for the activity feed while the
  // table uses UUIDs; ids here are positional within this bounded feed
  // (newest first). The normalizer coerces non-numeric ids the same way.
  const recentActivity: DashboardData["recentActivity"] = activityRows.map(
    (row, index) => {
      const projectName =
        row.projects?.name ??
        (row.project_id
          ? projectNameById(
              [...recentProjects, ...activeProjects],
              row.project_id,
            )
          : "");
      const actorName = row.user_id ? userDisplayName(row.user_id) : "";
      return {
        id: index,
        action: row.action || "Activity",
        project: projectName,
        user: actorName || "System",
        time: toIsoOrEmpty(row.created_at),
      };
    },
  );

  const upcomingValue = sprintsNext14 + tasksNext14;
  const upcomingThisWeek = sprintsNext7 + tasksNext7;
  const attentionValue = attentionTaskCount + attentionReqCount;
  const attentionHigh = attentionTaskHigh + attentionReqHigh;

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    },
    stats: {
      activeProjects: {
        value: activeCount,
        trend: activeNewWeek > 0 ? `+${activeNewWeek}` : "",
      },
      teamMembers: {
        value: teamCount,
        trend: teamNewWeek > 0 ? `+${teamNewWeek}` : "",
      },
      upcomingDeadlines: {
        value: upcomingValue,
        trend: upcomingThisWeek > 0 ? `${upcomingThisWeek} this week` : "",
      },
      needsAttention: {
        value: attentionValue,
        trend: attentionHigh > 0 ? `${attentionHigh} high priority` : "",
      },
    },
    recentProjects: recentProjectsData,
    activeProjects: activeProjectsData,
    upcomingDeadlines,
    attentionItems,
    recentActivity,
  };
}
