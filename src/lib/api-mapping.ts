/**
 * Frontend API mapping — maps UI sections to their expected API endpoints
 * and response field shapes. This is the single source of truth for what the
 * frontend expects from the backend, used to guide API implementation.
 *
 * RULE: Never import from supabase/ or ../db/ in this file. Keep it frontend-safe.
 */

// -------------------------------------------------------
// Dashboard — KPI Stats (lines 36-41 in page.tsx)
// -------------------------------------------------------

export interface DashboardStatsKpi {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend: string; // e.g. "+2", "3 this week", "2 high priority"
}

// Active Projects: COUNT(projects WHERE status='active' AND org=caller) + delta
// Team Members: COUNT(active members in caller org)
// Upcoming Deadlines: COUNT(sprints ending ≤7d in org) + soonest 3
// Need Attention: blocked/at-risk items

export const DASHBOARD_STATS_MOCK: DashboardStatsKpi[] = [
  { label: "Active Projects", value: "12", icon: null, trend: "+2" },
  { label: "Team Members", value: "48", icon: null, trend: "+5" },
  { label: "Upcoming Deadlines", value: "7", icon: null, trend: "3 this week" },
  { label: "Need Attention", value: "3", icon: null, trend: "2 high priority" },
];

// -------------------------------------------------------
// Dashboard — Recent Projects (lines 43-76 in page.tsx)
// -------------------------------------------------------

export interface DashboardRecentProject {
  id: string; // or number, kept flexible
  name: string;
  client: string;
  status: string;
  progress: number;
  lastUpdated: string; // relative time like "2 hours ago"
}

// -------------------------------------------------------
// Dashboard — Recent Activity (lines 78-83 in page.tsx)
// -------------------------------------------------------

export interface DashboardRecentActivity {
  id: number;
  action: string;
  project: string;
  user: string;
  time: string; // relative time like "10 min ago"
}

// -------------------------------------------------------
// Dashboard — Active Projects Table (lines 85-136 in page.tsx)
// -------------------------------------------------------

export interface DashboardProjectTableRow {
  id: string;
  name: string;
  client: string;
  manager: string;
  status: string;
  progress: number;
  sprint: string;
  endDate: string; // ISO-8601
}

// -------------------------------------------------------
// Dashboard — Full response shape (from docs §7.2)
// -----------------------------------------------------

/**
 * Organization summary included in dashboard response.
 * Derived from the caller's session org membership.
 */
export interface DashboardOrganization {
  id: string;
  name: string;
  slug: string;
}

/**
 * Stat value with trend string (preserving mock shape per §7.2).
 * A future iteration may promote this to { delta, window } objects.
 */
export interface DashboardStatValue {
  value: number | string;
  trend: string;
}

/** Individual recent project item */
export interface DashboardRecentProjectItem {
  id: string;
  name: string;
  client: string;
  status: string;
  progress: number;
  updatedAt: string; // ISO-8601 UTC
  manager?: DashboardUserSummary;
  currentSprint?: DashboardSprintSummary;
}

/** Individual active project item */
export interface DashboardActiveProjectItem {
  id: string;
  name: string;
  client: string;
  manager: DashboardUserSummary;
  status: string;
  progress: number;
  currentSprint: DashboardSprintSummary;
  endDate: string; // ISO-8601
}

/** User summary (minimal, avoids duplicating full users table) */
export interface DashboardUserSummary {
  id: string;
  name: string;
}

/** Sprint summary */
export interface DashboardSprintSummary {
  id: string;
  name: string;
}

/** Deadline item - kind: "sprint" | "task" */
export interface DashboardDeadlineItem {
  kind: "sprint" | "task";
  id: string;
  title: string;
  project: DashboardUserSummary; // project name/origination
  dueDate: string; // ISO-8601 UTC
  daysRemaining?: number;
}

/** Attention item - kind: "task" | "requirement" */
export interface DashboardAttentionItem {
  kind: "task" | "requirement";
  id: string;
  displayId: string; // e.g. "TASK-101" or "REQ-23"
  title: string;
  priority: "high" | "medium" | "low";
  status: string;
  project: { id: string; name: string };
  assignee?: DashboardUserSummary;
}

/** Full dashboard response envelope */
export interface DashboardResponse {
  success: true;
  data: {
    organization: DashboardOrganization;
    stats: {
      activeProjects: DashboardStatValue;
      teamMembers: DashboardStatValue;
      upcomingDeadlines: DashboardStatValue;
      needsAttention: DashboardStatValue;
    };
    recentProjects: DashboardRecentProjectItem[];
    activeProjects: DashboardActiveProjectItem[];
    upcomingDeadlines: DashboardDeadlineItem[];
    attentionItems: DashboardAttentionItem[];
    recentActivity: DashboardRecentActivity[];
  };
  error?: never;
}

/** Error response shape (kept consistent with §7.3) */
export interface DashboardErrorResponse {
  success: false;
  error: {
    code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR" | "INTERNAL_ERROR";
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

// -------------------------------------------------------
// Non-dashboard endpoints (from §8.1)
// -------------------------------------------------------

/** Projects list query params (from §8.1 #2) */
export interface ProjectsListQuery {
  status?: string;
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

/** Projects list item - minimal shape for list views */
export interface ProjectsListItem {
  id: string;
  name: string;
  client: string;
  status: string;
  progress: number;
}

/** Requirements list query params */
export interface RequirementsListQuery {
  project_id?: string;
  status?: string;
  category?: string;
  priority?: string;
  assignee_id?: string;
  sprint_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/** Task list query params */
export interface TasksListQuery {
  project_id?: string;
  sprint_id?: string;
  status?: string;
  assignee_id?: string;
  priority?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/** My work tasks - user-scoped */
export interface MyTasksQuery {
  status?: string;
  sprint_id?: string;
  priority?: string;
}

/** Sprint board */
export interface SprintBoardQuery {
  project_id: string;
}

/** Backlog items */
export interface BacklogListQuery {
  project_id?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/** Notification list query params */
export interface NotificationsListQuery {
  type?: "info" | "warning" | "error" | "success";
  read?: "unread" | "read";
  page?: number;
  limit?: number;
}

// -------------------------------------------------------
// AI Recommendations (from §8.1 #9)
// -------------------------------------------------------

export interface AiRecommendationsQuery {
  project_id?: string;
  status?: string;
}

// Single recommendation item
export interface AiRecommendationItem {
  id: string;
  requirementId: string;
  title: string;
  description?: string;
  predictedOutcome?: "success" | "failure" | "neutral";
  confidence?: number;
  status?: "pending" | "approved" | "rejected";
  createdAt: string;
}

/** Notification item */
export interface NotificationItem {
  id: string;
  userId: string;
  type: "info" | "warning" | "error" | "success";
  title: string;
  message: string;
  relatedId?: string; // project_id, task_id, etc.
  relatedType?: "project" | "task" | "requirement";
  read: boolean;
  createdAt: string;
}

/** Mark notification read request */
export interface MarkNotificationReadRequest {
  id: string;
}

/** Mark all notifications read request */
export interface MarkAllNotificationsReadRequest {
  userId: string;
}