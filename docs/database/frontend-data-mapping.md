# Frontend Data Mapping — SmartSprint AI

Comprehensive audit of all frontend mock/static data, mapped to the existing database schema and documenting future API/data requirements.

Generated: 2026-09-01

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Frontend Data Sources](#2-frontend-data-sources)
3. [Page-by-Page Data Requirements](#3-page-by-page-data-requirements)
4. [Database Mapping](#4-database-mapping)
5. [Derived Metrics](#5-derived-metrics)
6. [Relationships](#6-relationships)
7. [Filtering / Sorting / Search](#7-filtering--sorting--search)
8. [Dashboard / Analytics](#8-dashboard--analytics)
9. [Authentication / Roles](#9-authentication--roles)
10. [Storage Requirements](#10-storage-requirements)
11. [Realtime Requirements](#11-realtime-requirements)
12. [Schema Gaps](#12-schema-gaps)
13. [Recommended Next Steps](#13-recommended-next-steps)

---

## 1. Executive Summary

SmartSprint AI's frontend contains **54 distinct mock/static data sources** spread across **20 pages**. The application consumes data for **12 primary domain entities**: Projects, Requirements, Sprints, Tasks, Users, Teams, Documents, Notifications, Activity Logs, AI Recommendations, Budget/Cost, and Governance records (contracts, approvals, risks, change requests).

The existing database schema (`supabase/schema.ts`) covers the **core CRUD entities** well — users, teams, projects, sprints, requirements, tasks, backlog, AI predictions, activity logs, notifications, invitations, and join tables for team/project membership. However, the frontend UI presents several data categories that **have no corresponding database tables**:

- **Documents/Folders** — file management
- **Contracts** — vendor/contract management
- **Budget Categories** — cost tracking with allocated/spent amounts
- **Approvals** — workflow approval requests
- **Risks** — project risk register
- **Change Requests** — scope/technical change tracking
- **Milestones** — project milestone tracking
- **Calendar Events** — event scheduling
- **User Profile** (extended) — job title, avatar, theme preferences
- **Organization Settings** — org name, URL, industry, timezone

Additionally, the frontend expects many **derived/computed values** (progress percentages, velocity, workload distributions, contribution percentages) that should be calculated at the API layer rather than stored.

The frontend also reveals clear **file storage needs** (document uploads, avatar images) and hints at **realtime requirements** (activity feeds, notifications, sprint updates).

---

## 2. Frontend Data Sources

### 2.1 Complete Source Inventory

| # | File | Variable | Records | Represents | Page |
|---|------|----------|---------|------------|------|
| 1 | `src/app/dashboard/page.tsx` | `stats` | 4 | Dashboard KPI cards | Dashboard |
| 2 | `src/app/dashboard/page.tsx` | `recentProjects` | 4 | Recent project cards | Dashboard |
| 3 | `src/app/dashboard/page.tsx` | `recentActivity` | 4 | Activity feed items | Dashboard |
| 4 | `src/app/dashboard/page.tsx` | `projects` | 5 | Active projects table | Dashboard |
| 5 | `src/app/projects/page.tsx` | `projects` | 6 | Project listing table | Projects |
| 6 | `src/app/projects/page.tsx` | `filters` | 5 | Status filter tabs | Projects |
| 7 | `src/app/projects/[id]/page.tsx` | `project` | 1 | Current project detail | Project Detail |
| 8 | `src/app/projects/[id]/page.tsx` | `stats` | 4 | Project stat cards | Project Detail |
| 9 | `src/app/projects/[id]/page.tsx` | `actionableItems` | 4 | Action items | Project Detail |
| 10 | `src/app/projects/[id]/page.tsx` | `timeline` | 6 | SDLC timeline stages | Project Detail |
| 11 | `src/app/projects/[id]/page.tsx` | `upcomingDeadlines` | 4 | Deadline items | Project Detail |
| 12 | `src/app/projects/[id]/page.tsx` | `recentActivity` | 5 | Project activity feed | Project Detail |
| 13 | `src/app/requirements/page.tsx` | `stats` | 4 | Requirement stat cards | Requirements |
| 14 | `src/app/requirements/page.tsx` | `requirements` | 6 | Requirements table | Requirements |
| 15 | `src/app/requirements/page.tsx` | `awaitingAction` | 3 | Requirements needing action | Requirements |
| 16 | `src/app/requirements/page.tsx` | `filters` | 6 | Status filter tabs | Requirements |
| 17 | `src/app/sprint-planning/page.tsx` | `capacity` | 1 | Team capacity object | Sprint Planning |
| 18 | `src/app/sprint-planning/page.tsx` | `availableRequirements` | 4 | Available reqs for sprint | Sprint Planning |
| 19 | `src/app/sprint-planning/page.tsx` | `sprintAllocation` | 2 | Allocated reqs | Sprint Planning |
| 20 | `src/app/sprint-board/page.tsx` | `sprint` | 1 | Current sprint detail | Sprint Board |
| 21 | `src/app/sprint-board/page.tsx` | `columns` | 6 | Kanban columns | Sprint Board |
| 22 | `src/app/sprint-board/page.tsx` | `tasks` | 12 | Kanban task cards | Sprint Board |
| 23 | `src/app/sprint-board/page.tsx` | `listTasks` | 5 | List view tasks | Sprint Board |
| 24 | `src/app/backlog/page.tsx` | `backlogItems` | 8 | Product backlog items | Backlog |
| 25 | `src/app/execution/page.tsx` | `myTasks` | 4 | Current user tasks | Execution |
| 26 | `src/app/execution/page.tsx` | `teamTasks` | 5 | Team task table | Execution |
| 27 | `src/app/execution/page.tsx` | `recentActivity` | 4 | User activity feed | Execution |
| 28 | `src/app/team/page.tsx` | `users` | 6 | User management table | Team |
| 29 | `src/app/team/page.tsx` | `teams` | 4 | Team cards | Team |
| 30 | `src/app/team/page.tsx` | `invitations` | 2 | Pending invitations | Team |
| 31 | `src/app/team/page.tsx` | `roles` | 4 | Roles & permissions | Team |
| 32 | `src/app/governance/page.tsx` | `budgetItems` | 4 | Budget table rows | Governance |
| 33 | `src/app/governance/page.tsx` | `contracts` | 3 | Contract table rows | Governance |
| 34 | `src/app/governance/page.tsx` | `approvals` | 3 | Approval table rows | Governance |
| 35 | `src/app/governance/page.tsx` | `risks` | 3 | Risk register rows | Governance |
| 36 | `src/app/governance/page.tsx` | `changeRequests` | 3 | Change request rows | Governance |
| 37 | `src/app/documents/page.tsx` | `folders` | 6 | Folder tree items | Documents |
| 38 | `src/app/documents/page.tsx` | `documents` | 6 | Document list/grid | Documents |
| 39 | `src/app/reports/page.tsx` | `reportCategories` | 9 | Report type sidebar | Reports |
| 40 | `src/app/reports/page.tsx` | `sprintReport` | 1 | Sprint report summary | Reports |
| 41 | `src/app/reports/page.tsx` | `teamContributions` | 5 | Contribution table | Reports |
| 42 | `src/app/reports/page.tsx` | `budgetReport` | 1 | Budget report summary | Reports |
| 43 | `src/app/monitoring/page.tsx` | `healthIndicators` | 5 | Health status cards | Monitoring |
| 44 | `src/app/monitoring/page.tsx` | `currentSprint` | 1 | Sprint overview | Monitoring |
| 45 | `src/app/monitoring/page.tsx` | `milestones` | 5 | Milestone list | Monitoring |
| 46 | `src/app/monitoring/page.tsx` | `upcomingDeadlines` | 3 | Deadline cards | Monitoring |
| 47 | `src/app/monitoring/page.tsx` | `teamWorkload` | 5 | Workload table | Monitoring |
| 48 | `src/app/monitoring/page.tsx` | `risks` | 2 | Risk cards | Monitoring |
| 49 | `src/app/monitoring/page.tsx` | `recentActivity` | 4 | Activity feed | Monitoring |
| 50 | `src/app/calendar/page.tsx` | `events` | 6 | Calendar events | Calendar |
| 51 | `src/app/ai-recommendations/page.tsx` | `stats` | 4 | AI stat cards | AI Recs |
| 52 | `src/app/ai-recommendations/page.tsx` | `recommendations` | 4 | Pending recommendations | AI Recs |
| 53 | `src/app/ai-recommendations/page.tsx` | `approvedRecommendations` | 2 | Approved recs list | AI Recs |
| 54 | `src/app/notifications/page.tsx` | `notifications` | 6 | Notification list | Notifications |

### 2.2 Cross-Page Data Sources

The following entities appear across multiple pages (same conceptual data, different mock instances):

| Entity | Pages Where It Appears |
|--------|----------------------|
| Projects | Dashboard, Projects, Project Detail, Create Project, Reports |
| Requirements | Requirements, Sprint Planning, Backlog, AI Recommendations |
| Tasks | Sprint Board, Execution, Monitoring |
| Sprints | Sprint Board, Sprint Planning, Monitoring, Reports |
| Users/Team Members | Team, Dashboard (activity users), Project Detail (team), Reports (contributions), Monitoring (workload) |
| Activity Logs | Dashboard, Project Detail, Execution, Monitoring |
| Notifications | Notifications, Dashboard (implied) |
| AI Recommendations | AI Recommendations page |
| Budget | Governance, Reports, Create Project |
| Risks | Governance, Monitoring |

### 2.3 Constants/Configuration Data

**File:** `src/lib/constants.ts`

| Export | Type | Items | Purpose |
|--------|------|-------|---------|
| `STATUS_COLORS` | Object | 14 status keys | Maps status values to Tailwind classes |
| `PRIORITY_OPTIONS` | Array | 3 | Priority selection (high/medium/low) |
| `STATUS_OPTIONS` | Array | 7 | Status selection options |
| `REQUIREMENT_TYPES` | Array | 9 | Requirement category types |
| `SPRINT_STATUSES` | Array | 4 | Sprint status options |
| `PROJECT_METHODS` | Array | 4 | Project methodology options |

These are presentation-layer configuration and map directly to the existing database enums.

---

## 3. Page-by-Page Data Requirements

### 3.1 Dashboard (`/dashboard`)

**Purpose:** Organization-wide overview for managers/admins.

**Data consumed:**
- Summary statistics (active projects, team members, upcoming deadlines, items needing attention)
- Recent project cards with progress
- Recent activity feed
- Active projects table with manager, sprint, end date

**Current source:** 4 hardcoded arrays/objects (sources #1–4)

**Required entities:**
- `projects` (filtered by status)
- `users` (count of active members)
- `activity_logs` (recent entries)
- `sprints` (for deadline queries)

**Required fields:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| Active Projects count | projects | status='active' | COUNT query |
| Team Members count | users | status='active' | COUNT query |
| Upcoming Deadlines | sprints | end_date | Sprints ending soon |
| Need Attention | tasks, requirements | status | Items in blocking states |
| project.id | projects | id | UUID |
| project.name | projects | name | Direct |
| project.client | projects | client | Direct |
| project.status | projects | status | Direct enum |
| project.progress | projects | progress | Direct integer |
| project.lastUpdated | projects | updated_at | Relative time formatting |
| project.manager | users.first_name, users.last_name | via projects.manager_id → users.id | JOIN |
| project.sprint | sprints.name | via current sprint | Derived: latest active sprint |
| project.endDate | projects | end_date | Direct |
| activity.action | activity_logs | action | Direct |
| activity.project | projects.name | via activity_logs.project_id → projects.id | JOIN |
| activity.user | users.first_name, users.last_name | via activity_logs.user_id → users.id | JOIN |
| activity.time | activity_logs | created_at | Relative time formatting |

**Derived values:**
- Active Projects count: `COUNT(projects WHERE status = 'active')`
- Team Members count: `COUNT(users WHERE status = 'active')`
- Upcoming Deadlines count: `COUNT(sprints WHERE end_date BETWEEN now AND now + 7 days)`
- Need Attention count: `COUNT(tasks WHERE column_status IN ('review','testing')) + COUNT(requirements WHERE status = 'pending')`
- Last Updated relative time: `formatRelativeTime(projects.updated_at)`

**Future API:** `GET /api/dashboard/stats`, `GET /api/dashboard/projects`, `GET /api/dashboard/activity`

---

### 3.2 Projects List (`/projects`)

**Purpose:** List and manage all projects.

**Data consumed:**
- Projects with extended metadata (code, priority, team size)
- Status filter tabs with counts

**Current source:** 2 hardcoded arrays (sources #5–6)

**Required entities:**
- `projects`
- `project_members` (for team count)
- `users` (for manager name)

**Required fields:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| project.id | projects | id | UUID |
| project.name | projects | name | Direct |
| project.code | projects | code | Direct |
| project.client | projects | client | Direct |
| project.manager | users | via projects.manager_id | JOIN |
| project.status | projects | status | Direct enum |
| project.progress | projects | progress | Direct |
| project.sprint | sprints | current sprint name | Derived |
| project.endDate | projects | end_date | Direct |
| project.team | project_members | COUNT | Derived count |
| project.priority | projects | priority | Direct enum |
| filters.count | derived | per-status count | COUNT queries |

**Derived values:**
- Team size: `COUNT(project_members WHERE project_id = X)`
- Current sprint name: Derived from latest active sprint for project
- Filter counts: `COUNT(projects GROUP BY status)`

**Client-side filtering:**
- Search by name, client, code (currently client-side)

**Future API:** `GET /api/projects?status=&search=&page=&limit=`

---

### 3.3 Project Detail (`/projects/[id]`)

**Purpose:** Command center for a single project.

**Data consumed:**
- Full project record
- Stats (progress, current sprint, requirements ratio, budget)
- Actionable items
- SDLC timeline
- Upcoming deadlines
- Recent activity
- Team member avatars

**Current source:** 6 hardcoded arrays/objects (sources #7–12)

**Required entities:**
- `projects`
- `requirements` (for count/ratio)
- `sprints` (for current sprint, deadlines)
- `tasks` (for progress calculations)
- `activity_logs` (for activity feed)
- `users` (for team, manager)
- `project_members` (for team list)

**Required fields:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| project.name | projects | name | Direct |
| project.code | projects | code | Direct |
| project.client | projects | client | Direct |
| project.status | projects | status | Direct |
| project.progress | projects | progress | Direct |
| project.sprint | sprints | name | Current active sprint |
| project.sprintProgress | derived | | Completed pts / total pts |
| project.description | projects | UNMAPPED | See Schema Gaps |
| project.manager | users | via manager_id | JOIN |
| project.startDate | projects | UNMAPPED | See Schema Gaps |
| project.endDate | projects | end_date | Direct |
| project.team | project_members | COUNT | Derived |
| project.methodology | projects | method | Direct |
| project.priority | projects | priority | Direct |
| stats.Requirements value | requirements | "42/65" | Derived: approved/total |
| stats.Budget value | UNMAPPED | "$145K/$200K" | No budget table |
| timeline.stage | UNMAPPED | | See Schema Gaps |
| timeline.status | UNMAPPED | | See Schema Gaps |
| deadlines.date | sprints.end_date | | Direct |
| deadlines.type | UNMAPPED | | See Schema Gaps |

**Derived values:**
- Sprint progress: `SUM(task.points WHERE status='done') / SUM(task.points) * 100`
- Requirements ratio: `COUNT(requirements WHERE status='approved') / COUNT(requirements) * 100`
- Team count: `COUNT(project_members WHERE project_id = X)`

**Future API:** `GET /api/projects/:id`

---

### 3.4 Requirements (`/requirements`)

**Purpose:** Manage requirements lifecycle.

**Data consumed:**
- Summary statistics
- Requirements list with filtering
- Validation queue
- Traceability
- Categories

**Current source:** 4 hardcoded arrays (sources #13–16)

**Required entities:**
- `requirements`
- `sprints` (for sprint assignment)
- `users` (for assignee)
- `projects` (for project context)

**Required fields:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| req.id (display) | requirements | display_id | e.g. "REQ-001" |
| req.title | requirements | title | Direct |
| req.category | requirements | category | Direct enum |
| req.businessValue | requirements | business_value | Direct enum |
| req.status | requirements | status | Direct enum |
| req.priority | requirements | priority | Direct enum |
| req.sprint | sprints.name | via requirements.sprint_id | JOIN |
| req.assignee | users | via requirements.assignee_id | JOIN |
| req.lastUpdated | requirements | updated_at | Relative time |
| stats.Total | derived | | COUNT(requirements WHERE project_id=X) |
| stats.Pending Validation | derived | | COUNT WHERE status='pending' |
| stats.Ready for AI | derived | | COUNT WHERE status='inProgress' |
| stats.Approved | derived | | COUNT WHERE status='approved' |

**Derived values:**
- Total Requirements: `COUNT(requirements WHERE project_id = X)`
- Pending Validation: `COUNT(requirements WHERE status = 'pending')`
- Ready for AI: `COUNT(requirements WHERE status = 'inProgress')`
- Approved: `COUNT(requirements WHERE status = 'approved')`
- Filter counts: `COUNT(requirements GROUP BY status)`

**Future API:** `GET /api/requirements?project_id=&status=&search=&page=&limit=`

---

### 3.5 Sprint Planning (`/sprint-planning`)

**Purpose:** Plan upcoming sprint with capacity management.

**Data consumed:**
- Team capacity (total, allocated, remaining)
- Available requirements with points and dependencies
- Sprint allocation list

**Current source:** 3 hardcoded arrays/objects (sources #17–19)

**Required entities:**
- `requirements` (approved, unallocated)
- `sprints` (for recommended sprint)
- `tasks` (for dependency tracking)

**Required fields:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| capacity.total | UNMAPPED | | See Schema Gaps |
| capacity.allocated | derived | | SUM of allocated points |
| availableRequirements.id | requirements | display_id | Direct |
| availableRequirements.title | requirements | title | Direct |
| availableRequirements.points | requirements | story_points | Direct |
| availableRequirements.dependencies | requirements | dependency_id | JOIN to dependency |
| availableRequirements.recommendedSprint | ai_predictions | suggested_sprint_id | Via AI |
| sprintAllocation.* | same as above | | Requirements already in sprint |

**Derived values:**
- Total allocated: `SUM(requirements.story_points WHERE sprint_id = X)`
- Remaining capacity: `capacity.total - total_allocated`

**Future API:** `GET /api/sprints/planning?project_id=`

---

### 3.6 Sprint Board (`/sprint-board`)

**Purpose:** Kanban/list view of current sprint tasks.

**Data consumed:**
- Sprint detail (name, goal, dates, progress, points)
- Kanban columns with task counts
- Task cards with priority, points, assignee
- List view with assignee names and statuses

**Current source:** 4 hardcoded arrays/objects (sources #20–23)

**Required entities:**
- `sprints`
- `tasks`
- `users` (for assignee)

**Required fields:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| sprint.name | sprints | name | Direct |
| sprint.goal | sprints | goal | Direct |
| sprint.startDate | sprints | start_date | Direct |
| sprint.endDate | sprints | end_date | Direct |
| sprint.status | sprints | status | Direct enum |
| sprint.progress | derived | | completed_points / total_points |
| sprint.totalPoints | sprints | total_points | Direct |
| sprint.completedPoints | sprints | completed_points | Direct |
| sprint.remainingDays | derived | | end_date - today |
| columns.id | task_column_status | enum values | backlog/todo/inProgress/review/testing/done |
| columns.count | derived | | COUNT(tasks WHERE column_status=X AND sprint_id=Y) |
| task.id | tasks | display_id | e.g. "TASK-101" |
| task.title | tasks | title | Direct |
| task.priority | tasks | priority | Direct enum |
| task.points | tasks | points | Direct |
| task.assignee | users | via tasks.assignee_id | JOIN |
| task.column | tasks | column_status | Direct enum |
| task.status | derived | | Mapped from column_status |
| task.updated | tasks | updated_at | Relative time |

**Derived values:**
- Sprint progress: `(completed_points / total_points) * 100`
- Remaining points: `total_points - completed_points`
- Remaining days: `end_date - CURRENT_DATE`
- Column task counts: `COUNT(tasks GROUP BY column_status WHERE sprint_id = X)`

**Future API:** `GET /api/sprints/:id/board`, `PATCH /api/tasks/:id/move`

---

### 3.7 Backlog (`/backlog`)

**Purpose:** Manage prioritized product backlog.

**Data consumed:**
- Backlog items with priority ranking, story points, sprint assignment, owner

**Current source:** 1 hardcoded array (source #24)

**Required entities:**
- `backlog` (for rank ordering)
- `requirements` (for item details)
- `sprints` (for sprint assignment)
- `users` (for owner)

**Required fields:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| item.id | requirements | display_id | Via backlog.requirement_id |
| item.priority | backlog | rank | Priority ordering |
| item.title | requirements | title | Direct |
| item.storyPoints | requirements | story_points | Direct |
| item.sprint | sprints.name | via requirements.sprint_id | JOIN |
| item.status | requirements | status | Direct enum |
| item.owner | users | via requirements.assignee_id | JOIN |
| item.category | requirements | category | Direct enum |

**Future API:** `GET /api/backlog?project_id=`, `PATCH /api/backlog/reorder`

---

### 3.8 Execution Workspace (`/execution`)

**Purpose:** Developer-focused task management view.

**Data consumed:**
- My tasks (assigned to current user)
- Team tasks (all team tasks)
- Today's summary stats
- Recent activity

**Current source:** 3 hardcoded arrays (sources #25–27)

**Required entities:**
- `tasks` (filtered by assignee)
- `users` (for team members)
- `sprints` (for sprint context)
- `projects` (for project context)
- `activity_logs` (for activity)

**Required fields:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| task.id | tasks | display_id | Direct |
| task.title | tasks | title | Direct |
| task.priority | tasks | priority | Direct |
| task.status | tasks | column_status | Derived mapping |
| task.dueDate | UNMAPPED | | See Schema Gaps |
| task.progress | UNMAPPED | | See Schema Gaps |
| task.sprint | sprints.name | via tasks.sprint_id | JOIN |
| task.project | projects.name | via tasks.project_id | JOIN |
| task.assignee | users | via tasks.assignee_id | JOIN |
| task.updated | tasks | updated_at | Relative time |
| summary.In Progress | derived | | COUNT WHERE column_status='inProgress' AND assignee=current |
| summary.To Do | derived | | COUNT WHERE column_status='todo' AND assignee=current |
| summary.In Review | derived | | COUNT WHERE column_status='review' AND assignee=current |
| summary.Completed Today | derived | | COUNT WHERE status='done' AND updated today |

**Future API:** `GET /api/tasks/my-work`, `GET /api/tasks/team-work`

---

### 3.9 Team Management (`/team`)

**Purpose:** Manage users, teams, roles, and invitations.

**Data consumed:**
- User list with role, department, status, project count, last active
- Team cards with member count and lead
- Pending invitations
- Roles with permissions and user counts

**Current source:** 4 hardcoded arrays (sources #28–31)

**Required entities:**
- `users`
- `teams`
- `team_members`
- `project_members`
- `invitations`
- `user_role` enum (for roles)

**Required fields:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| user.id | users | id | UUID |
| user.name | users | first_name, last_name | CONCAT |
| user.email | users | email | Direct |
| user.role | users | role | Direct enum |
| user.department | users | department | Direct |
| user.status | users | status | Direct enum |
| user.projects | project_members | COUNT | Derived |
| user.lastActive | UNMAPPED | | See Schema Gaps |
| team.id | teams | id | UUID |
| team.name | teams | name | Direct |
| team.members | team_members | COUNT | Derived |
| team.lead | users | via teams.lead_id | JOIN |
| invitation.email | invitations | email | Direct |
| invitation.role | invitations | role | Direct enum |
| invitation.sent | invitations | created_at | Relative time |
| invitation.status | invitations | status | Direct enum |
| role.name | user_role enum | enum values | Static |
| role.permissions | UNMAPPED | | See Schema Gaps |
| role.users | derived | | COUNT(users WHERE role=X) |

**Derived values:**
- User project count: `COUNT(project_members WHERE user_id = X)`
- Team member count: `COUNT(team_members WHERE team_id = X)`
- Role user count: `COUNT(users WHERE role = X)`

**Future API:** `GET /api/users`, `GET /api/teams`, `GET /api/invitations`, `GET /api/roles`

---

### 3.10 Governance (`/governance`)

**Purpose:** Manage budgets, contracts, approvals, risks, and change requests.

**Data consumed:**
- Budget categories with allocated/spent/remaining
- Contracts with vendor, value, status, expiry
- Approvals with requester, type, status
- Risk register with probability, impact, owner, mitigation
- Change requests with type, impact, status, requester

**Current source:** 5 hardcoded arrays (sources #32–36)

**Required entities:**
- **SCHEMA GAP** — None of these have database tables.

**Required fields (all UNMAPPED):**

| Source Field | Status | Notes |
|-------------|--------|-------|
| budgetItems.category | UNMAPPED | No budget table |
| budgetItems.allocated | UNMAPPED | |
| budgetItems.spent | UNMAPPED | |
| budgetItems.remaining | UNMAPPED | |
| budgetItems.status | UNMAPPED | |
| contracts.name | UNMAPPED | No contracts table |
| contracts.vendor | UNMAPPED | |
| contracts.value | UNMAPPED | |
| contracts.status | UNMAPPED | |
| contracts.expiry | UNMAPPED | |
| approvals.title | UNMAPPED | No approvals table |
| approvals.requester | UNMAPPED | |
| approvals.type | UNMAPPED | |
| approvals.status | UNMAPPED | |
| approvals.requested | UNMAPPED | |
| risks.title | UNMAPPED | No risks table |
| risks.probability | UNMAPPED | |
| risks.impact | UNMAPPED | |
| risks.owner | UNMAPPED | |
| risks.mitigation | UNMAPPED | |
| changeRequests.id | UNMAPPED | No change_requests table |
| changeRequests.title | UNMAPPED | |
| changeRequests.type | UNMAPPED | |
| changeRequests.impact | UNMAPPED | |
| changeRequests.status | UNMAPPED | |
| changeRequests.requester | UNMAPPED | |
| changeRequests.date | UNMAPPED | |

**Future API:** `GET /api/governance/budget`, `GET /api/governance/contracts`, etc.

---

### 3.11 Documents (`/documents`)

**Purpose:** File management for project documents.

**Data consumed:**
- Folder tree with document counts
- Document list/grid with metadata

**Current source:** 2 hardcoded arrays (sources #37–38)

**Required entities:**
- **SCHEMA GAP** — No documents or folders tables.

**Required fields (all UNMAPPED):**

| Source Field | Status | Notes |
|-------------|--------|-------|
| folder.id | UNMAPPED | No folders table |
| folder.name | UNMAPPED | |
| folder.count | UNMAPPED | Derived: COUNT(documents WHERE folder=X) |
| document.id | UNMAPPED | No documents table |
| document.name | UNMAPPED | |
| document.type | UNMAPPED | Derived from extension |
| document.size | UNMAPPED | |
| document.owner | UNMAPPED | FK to users |
| document.modified | UNMAPPED | |
| document.version | UNMAPPED | |
| document.folder | UNMAPPED | FK to folders |

**Future API:** `GET /api/documents?folder=`, `POST /api/documents/upload`

---

### 3.12 Reports (`/reports`)

**Purpose:** Generate and export professional reports.

**Data consumed:**
- Report categories (static UI config)
- Sprint report summary
- Team contribution breakdown
- Budget report with categories

**Current source:** 4 hardcoded arrays/objects (sources #39–42)

**Required entities:**
- `sprints` (for sprint metrics)
- `tasks` (for completion data)
- `users` (for contribution data)
- **SCHEMA GAP** — Budget data has no table.

**Required fields (partially mapped):**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| sprintReport.sprint | sprints | name | Direct |
| sprintReport.goal | sprints | goal | Direct |
| sprintReport.duration | sprints | start_date, end_date | Derived string |
| sprintReport.completion | derived | | (completed_points / total_points) * 100 |
| sprintReport.velocity | UNMAPPED | | See Schema Gaps |
| sprintReport.totalPoints | sprints | total_points | Direct |
| sprintReport.completedPoints | sprints | completed_points | Direct |
| sprintReport.pendingPoints | derived | | total - completed - carry_forward |
| sprintReport.carryForward | UNMAPPED | | See Schema Gaps |
| sprintReport.blocked | derived | | COUNT(tasks WHERE column_status='done' is false) |
| teamContributions.* | UNMAPPED | | Per-member stats |
| budgetReport.* | UNMAPPED | | No budget table |

**Future API:** `GET /api/reports/sprint?project_id=`, `GET /api/reports/budget?project_id=`

---

### 3.13 Monitoring (`/monitoring`)

**Purpose:** Project health dashboard with indicators, milestones, workload.

**Data consumed:**
- Health indicator cards
- Current sprint overview
- Milestones list
- Upcoming deadlines
- Team workload table
- Risks & blockers
- Recent activity

**Current source:** 7 hardcoded arrays/objects (sources #43–49)

**Required entities:**
- `sprints` (current sprint)
- `tasks` (for workload calculation)
- `activity_logs` (for activity)
- **SCHEMA GAP** — Milestones, Risks have no tables.

**Required fields (partially mapped):**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| healthIndicators.* | UNMAPPED | | Computed from multiple sources |
| currentSprint.* | sprints | various | Direct |
| milestones.* | UNMAPPED | | No milestones table |
| upcomingDeadlines.* | sprints, UNMAPPED | end_date | Mixed |
| teamWorkload.member | users | name | |
| teamWorkload.assigned | tasks | COUNT | Assigned tasks count |
| teamWorkload.inProgress | tasks | COUNT | WHERE column_status='inProgress' |
| teamWorkload.completed | tasks | COUNT | WHERE column_status='done' |
| risks.* | UNMAPPED | | No risks table |
| recentActivity.* | activity_logs | various | Direct |

**Future API:** `GET /api/monitoring/health?project_id=`

---

### 3.14 Calendar (`/calendar`)

**Purpose:** View project events on a calendar.

**Data consumed:**
- Calendar events (sprint dates, meetings, milestones, deadlines, document expiry)

**Current source:** 1 hardcoded array (source #50)

**Required entities:**
- **SCHEMA GAP** — No calendar events table.
- Partially derivable from `sprints` (start/end dates) and `milestones` (if added).

**Required fields (all UNMAPPED):**

| Source Field | Status | Notes |
|-------------|--------|-------|
| event.id | UNMAPPED | |
| event.title | UNMAPPED | |
| event.date | UNMAPPED | |
| event.type | UNMAPPED | sprint/meeting/milestone/deadline/document |
| event.time | UNMAPPED | |

**Future API:** `GET /api/calendar?project_id=&month=&year=`

---

### 3.15 AI Recommendations (`/ai-recommendations`)

**Purpose:** Review AI-generated requirement prioritization recommendations.

**Data consumed:**
- Analysis statistics (counts by priority)
- Pending recommendations with confidence scores
- Approved recommendations

**Current source:** 3 hardcoded arrays/objects (sources #51–53)

**Required entities:**
- `ai_predictions`
- `requirements` (for linked requirement)
- `sprints` (for suggested sprint)
- `users` (for approver)

**Required fields:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| stats.Requirements Analysed | ai_predictions | COUNT | COUNT(WHERE requirement has prediction) |
| stats.High/Medium/Low Priority | ai_predictions | suggested_priority | COUNT grouped |
| rec.id | ai_predictions | (generated display id) | Derived |
| rec.requirement | requirements | title | Via ai_predictions.requirement_id |
| rec.category | requirements | category | Via requirement |
| rec.currentStatus | requirements | status | Via requirement |
| rec.suggestedPriority | ai_predictions | suggested_priority | Direct |
| rec.suggestedSprint | sprints | name | Via ai_predictions.suggested_sprint_id |
| rec.confidence | ai_predictions | confidence_score | Direct |
| rec.summary | ai_predictions | summary | Direct |
| rec.reasoning | ai_predictions | reasoning | Direct (jsonb) |
| rec.status | ai_predictions | recommendation_status | Direct |
| approvedRec.sprint | sprints | name | Via suggested_sprint_id |
| approvedRec.approvedBy | UNMAPPED | | See Schema Gaps |
| approvedRec.approvedDate | UNMAPPED | | See Schema Gaps |

**Future API:** `GET /api/ai/recommendations?project_id=`, `POST /api/ai/recommendations/:id/approve`

---

### 3.16 Notifications (`/notifications`)

**Purpose:** User notification center.

**Data consumed:**
- Notification list with type, priority, read status

**Current source:** 1 hardcoded array (source #54)

**Required entities:**
- `notifications`

**Required fields:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| notification.id | notifications | id | UUID |
| notification.type | notifications | type | Direct (text) |
| notification.title | notifications | title | Direct |
| notification.description | notifications | description | Direct |
| notification.time | notifications | created_at | Relative time formatting |
| notification.priority | notifications | priority | Direct enum |
| notification.read | notifications | read | Direct boolean |
| notification.action | notifications | action_label | Direct |

**Future API:** `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`

---

### 3.17 Settings (`/settings`)

**Purpose:** User profile, preferences, and organization settings.

**Data consumed:**
- User profile form defaults
- Notification preferences
- Organization settings

**Current source:** No arrays/objects — only form default values.

**Required entities:**
- `users` (for profile)
- **SCHEMA GAP** — User preferences, organization settings have no tables.

**Fields:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| firstName | users | first_name | Direct |
| lastName | users | last_name | Direct |
| email | users | email | Direct |
| jobTitle | UNMAPPED | | No job_title column |
| department | users | department | Direct |
| avatarInitials | users | avatar_initials | Direct |
| notification preferences | UNMAPPED | | No preferences table |
| organization.name | UNMAPPED | | No organizations table |
| organization.url | UNMAPPED | | |
| organization.industry | UNMAPPED | | |
| organization.timezone | UNMAPPED | | |

---

### 3.18 Create Project (`/projects/create`)

**Purpose:** Multi-step form for creating a new project.

**Data consumed:**
- Form select options (methodologies, priorities, industries, roles, currencies)

**Current source:** Inline select options — no arrays/objects.

**Required entities:**
- `projects` (for creation)
- `users` (for team member selection)
- `project_members` (for team assignment)

**Fields submitted:**

| Source Field | DB Table | DB Column | Notes |
|-------------|----------|-----------|-------|
| name | projects | name | Direct |
| code | projects | code | Direct |
| client | projects | client | Direct |
| industry | UNMAPPED | | No industry field |
| description | UNMAPPED | | No description field |
| methodology | projects | method | Direct enum |
| priority | projects | priority | Direct enum |
| startDate | UNMAPPED | | No start_date field |
| endDate | projects | end_date | Direct |
| budget | UNMAPPED | | No budget table |
| milestones | UNMAPPED | | No milestones table |
| manager | users | via projects.manager_id | FK |
| teamMembers | project_members | | Join table entries |

---

### 3.19 Login (`/login`)

**Purpose:** User authentication.

**Data consumed:** None — purely form fields.

**Required:** Supabase Auth integration.

---

### 3.20 Register (`/register`)

**Purpose:** User registration / organization creation.

**Data consumed:** None — purely form fields.

**Required:** Supabase Auth integration + user/org creation.

---

## 4. Database Mapping

### 4.1 Project Fields

| Frontend Field | → DB Table | → DB Column | Transformation | Notes |
|---------------|-----------|------------|----------------|-------|
| project.id | projects | id | UUID | Direct |
| project.name | projects | name | Direct | Direct |
| project.code | projects | code | Direct | Unique |
| project.client | projects | client | Direct | |
| project.status | projects | status | Enum mapping | active/inactive/pending/completed/blocked |
| project.progress | projects | progress | Integer 0–100 | Constrained in DB |
| project.priority | projects | priority | Enum mapping | high/medium/low |
| project.methodology | projects | method | Enum mapping | scrum/kanban/waterfall/hybrid |
| project.endDate | projects | end_date | Date | |
| project.startDate | UNMAPPED | — | — | **Schema Gap** |
| project.description | UNMAPPED | — | — | **Schema Gap** |
| project.sprint | sprints | name | JOIN via current active sprint | Derived |
| project.sprintProgress | derived | — | — | Calculated |
| project.manager | users | first_name + last_name | JOIN via manager_id | |
| project.team | project_members | COUNT | Aggregate query | |
| project.team[] | project_members | user_id | JOIN | For avatar display |

### 4.2 Requirement Fields

| Frontend Field | → DB Table | → DB Column | Transformation | Notes |
|---------------|-----------|------------|----------------|-------|
| req.displayId | requirements | display_id | String | e.g. "REQ-001" |
| req.title | requirements | title | Direct | |
| req.description | requirements | description | Direct | |
| req.category | requirements | category | Enum | feature/bug/etc. |
| req.businessValue | requirements | business_value | Enum | high/medium/low |
| req.priority | requirements | priority | Enum | high/medium/low |
| req.status | requirements | status | Enum | draft/pending/inProgress/review/testing/completed/blocked |
| req.storyPoints | requirements | story_points | Integer | |
| req.assignee | users | first_name + last_name | JOIN via assignee_id | |
| req.sprint | sprints | name | JOIN via sprint_id | |
| req.lastUpdated | requirements | updated_at | Relative time | |
| req.dependencies | requirements | dependency_id | Self-reference FK | |

### 4.3 Sprint Fields

| Frontend Field | → DB Table | → DB Column | Transformation | Notes |
|---------------|-----------|------------|----------------|-------|
| sprint.id | sprints | id | UUID | |
| sprint.name | sprints | name | Direct | e.g. "Sprint 4" |
| sprint.goal | sprints | goal | Direct | |
| sprint.status | sprints | status | Enum | planning/active/completed/cancelled |
| sprint.startDate | sprints | start_date | Date | |
| sprint.endDate | sprints | end_date | Date | |
| sprint.totalPoints | sprints | total_points | Integer | |
| sprint.completedPoints | sprints | completed_points | Integer | |
| sprint.progress | derived | — | — | (completed_points / total_points) * 100 |
| sprint.remainingDays | derived | — | — | end_date - CURRENT_DATE |
| sprint.projectId | sprints | project_id | FK | |

### 4.4 Task Fields

| Frontend Field | → DB Table | → DB Column | Transformation | Notes |
|---------------|-----------|------------|----------------|-------|
| task.displayId | tasks | display_id | String | e.g. "TASK-101" |
| task.title | tasks | title | Direct | |
| task.priority | tasks | priority | Enum | high/medium/low |
| task.points | tasks | points | Integer | |
| task.columnStatus | tasks | column_status | Enum | backlog/todo/inProgress/review/testing/done |
| task.sprintId | tasks | sprint_id | FK | |
| task.requirementId | tasks | requirement_id | FK | |
| task.projectId | tasks | project_id | FK | |
| task.assignee | users | first_name + last_name | JOIN via assignee_id | |
| task.status | derived from column_status | — | Mapping | "completed" for "done", etc. |
| task.progress | UNMAPPED | — | — | **Schema Gap** |
| task.dueDate | UNMAPPED | — | — | **Schema Gap** |

### 4.5 User Fields

| Frontend Field | → DB Table | → DB Column | Transformation | Notes |
|---------------|-----------|------------|----------------|-------|
| user.id | users | id | UUID | References auth.users |
| user.firstName | users | first_name | Direct | |
| user.lastName | users | last_name | Direct | |
| user.email | users | email | Direct | Unique |
| user.role | users | role | Enum | ADMIN/PROJECT_MANAGER/DEVELOPER |
| user.department | users | department | Direct | |
| user.status | users | status | Enum | active/inactive |
| user.avatarInitials | users | avatar_initials | Derived | first letters of name |
| user.projects | project_members | COUNT | Aggregate | |
| user.lastActive | UNMAPPED | — | — | **Schema Gap** |
| user.jobTitle | UNMAPPED | — | — | **Schema Gap** |

### 4.6 AI Prediction Fields

| Frontend Field | → DB Table | → DB Column | Transformation | Notes |
|---------------|-----------|------------|----------------|-------|
| rec.requirement | requirements | title | JOIN via requirement_id | |
| rec.category | requirements | category | JOIN | |
| rec.currentStatus | requirements | status | JOIN | |
| rec.suggestedPriority | ai_predictions | suggested_priority | Enum | |
| rec.suggestedSprint | sprints | name | JOIN via suggested_sprint_id | |
| rec.confidence | ai_predictions | confidence_score | Numeric | 0–100 |
| rec.summary | ai_predictions | summary | Direct | |
| rec.reasoning | ai_predictions | reasoning | jsonb | Array of strings |
| rec.status | ai_predictions | recommendation_status | Enum | pending/approved/rejected |
| rec.approvedBy | UNMAPPED | — | — | **Schema Gap** |
| rec.approvedDate | UNMAPPED | — | — | **Schema Gap** |

### 4.7 Notification Fields

| Frontend Field | → DB Table | → DB Column | Transformation | Notes |
|---------------|-----------|------------|----------------|-------|
| notification.id | notifications | id | UUID | |
| notification.type | notifications | type | Text | task/sprint/approval/document/budget/system |
| notification.title | notifications | title | Direct | |
| notification.description | notifications | description | Direct | |
| notification.priority | notifications | priority | Enum | high/medium/low |
| notification.read | notifications | read | Boolean | |
| notification.action | notifications | action_label | Direct | |
| notification.time | notifications | created_at | Relative time | |

### 4.8 Activity Log Fields

| Frontend Field | → DB Table | → DB Column | Transformation | Notes |
|---------------|-----------|------------|----------------|-------|
| activity.action | activity_logs | action | Direct | |
| activity.value | activity_logs | value | Direct | |
| activity.entityType | activity_logs | entity_type | Direct | |
| activity.entityId | activity_logs | entity_id | UUID | |
| activity.user | users | first_name + last_name | JOIN via user_id | |
| activity.project | projects | name | JOIN via project_id | |
| activity.time | activity_logs | created_at | Relative time | |

---

## 5. Derived Metrics

The frontend uses many computed values that should NOT be stored in the database but calculated at the API or application layer.

### 5.1 Sprint Metrics

| Metric | Calculation | Implementation |
|--------|-------------|----------------|
| Sprint Progress % | `(completed_points / total_points) * 100` | API / Database VIEW |
| Sprint Remaining Points | `total_points - completed_points` | API |
| Sprint Remaining Days | `end_date - CURRENT_DATE` | API |
| Sprint Velocity | `completed_points` of last completed sprint | API (query last completed sprint) |
| Column Task Count | `COUNT(tasks WHERE column_status = X AND sprint_id = Y)` | Database / API |

### 5.2 Project Metrics

| Metric | Calculation | Implementation |
|--------|-------------|----------------|
| Project Progress | Already stored in `projects.progress` — but should be recalculated | API |
| Active Projects Count | `COUNT(projects WHERE status = 'active')` | Database query |
| Team Size | `COUNT(project_members WHERE project_id = X)` | Database query |
| Current Sprint Name | `sprints.name WHERE project_id = X AND status = 'active'` | Database query |
| Requirements Ratio | `COUNT(requirements WHERE status = 'approved') / COUNT(requirements)` | Database query |
| Budget Spent % | `SUM(spent) / SUM(allocated) * 100` | API (requires budget table) |

### 5.3 User/Team Metrics

| Metric | Calculation | Implementation |
|--------|-------------|----------------|
| User Project Count | `COUNT(project_members WHERE user_id = X)` | Database query |
| Team Member Count | `COUNT(team_members WHERE team_id = X)` | Database query |
| Role User Count | `COUNT(users WHERE role = X)` | Database query |
| User Initials | `LEFT(first_name, 1) + LEFT(last_name, 1)` | API / Frontend |
| Contribution % | `(member_points / total_sprint_points) * 100` | API |
| Workload (assigned/in-progress/completed) | `COUNT(tasks WHERE assignee_id = X AND column_status = Y)` | Database query |

### 5.4 Dashboard Metrics

| Metric | Calculation | Implementation |
|--------|-------------|----------------|
| Active Projects | `COUNT(projects WHERE status = 'active')` | Database |
| Team Members | `COUNT(users WHERE status = 'active')` | Database |
| Upcoming Deadlines | `COUNT(sprints WHERE end_date BETWEEN now AND now + 7 days)` | Database |
| Need Attention | `COUNT(items WHERE status IN blocking_states)` | Database |

### 5.5 Filter Counts

| Metric | Calculation | Implementation |
|--------|-------------|----------------|
| Project filter counts | `COUNT(projects GROUP BY status)` | Database |
| Requirement filter counts | `COUNT(requirements GROUP BY status)` | Database |

---

## 6. Relationships

### 6.1 Relationships Required by the UI

```
Organization (SCHEMA GAP)
 └── Users
      ├── belongs to Teams (team_members)
      ├── manages Projects (projects.manager_id)
      ├── members of Projects (project_members)
      ├── assigned to Requirements (requirements.assignee_id)
      ├── assigned to Tasks (tasks.assignee_id)
      ├── leads Teams (teams.lead_id)
      └── receives Notifications (notifications.user_id)

Projects
 ├── managed by User (projects.manager_id → users.id)
 ├── members (project_members → users)
 ├── has Requirements
 │    ├── assigned to User
 │    ├── assigned to Sprint
 │    └── generates AI Predictions
 ├── has Sprints
 │    └── contains Tasks
 │         ├── assigned to User
 │         └── linked to Requirement
 ├── has Activity Logs
 ├── has Documents (SCHEMA GAP)
 ├── has Budget (SCHEMA GAP)
 ├── has Contracts (SCHEMA GAP)
 ├── has Approvals (SCHEMA GAP)
 ├── has Risks (SCHEMA GAP)
 ├── has Change Requests (SCHEMA GAP)
 ├── has Milestones (SCHEMA GAP)
 └── has Calendar Events (SCHEMA GAP)
```

### 6.2 Current Database Relationship Coverage

| UI Relationship | DB Support | Status |
|----------------|-----------|--------|
| Project → Manager | `projects.manager_id → users.id` | SUPPORTED |
| Project → Members | `project_members` | SUPPORTED |
| Project → Requirements | `requirements.project_id → projects.id` | SUPPORTED |
| Project → Sprints | `sprints.project_id → projects.id` | SUPPORTED |
| Sprint → Tasks | `tasks.sprint_id → sprints.id` | SUPPORTED |
| Task → Assignee | `tasks.assignee_id → users.id` | SUPPORTED |
| Task → Requirement | `tasks.requirement_id → requirements.id` | SUPPORTED |
| Requirement → Assignee | `requirements.assignee_id → users.id` | SUPPORTED |
| Requirement → Sprint | `requirements.sprint_id → sprints.id` | SUPPORTED |
| Requirement → Dependency | `requirements.dependency_id → requirements.id` | SUPPORTED |
| Team → Members | `team_members` | SUPPORTED |
| Team → Lead | `teams.lead_id → users.id` | SUPPORTED |
| AI Prediction → Requirement | `ai_predictions.requirement_id → requirements.id` | SUPPORTED |
| AI Prediction → Sprint | `ai_predictions.suggested_sprint_id → sprints.id` | SUPPORTED |
| Activity Log → Project | `activity_logs.project_id → projects.id` | SUPPORTED |
| Activity Log → User | `activity_logs.user_id → users.id` | SUPPORTED |
| Notification → User | `notifications.user_id → users.id` | SUPPORTED |
| Invitation → User | `invitations.invited_by → users.id` | SUPPORTED |
| Backlog → Requirement | `backlog.requirement_id → requirements.id` | SUPPORTED |
| Backlog → Project | `backlog.project_id → projects.id` | SUPPORTED |
| Project → Documents | N/A | **SCHEMA GAP** |
| Project → Budget | N/A | **SCHEMA GAP** |
| Project → Contracts | N/A | **SCHEMA GAP** |
| Project → Approvals | N/A | **SCHEMA GAP** |
| Project → Risks | N/A | **SCHEMA GAP** |
| Project → Change Requests | N/A | **SCHEMA GAP** |
| Project → Milestones | N/A | **SCHEMA GAP** |
| Calendar Events | N/A | **SCHEMA GAP** |
| User → Preferences | N/A | **SCHEMA GAP** |
| Organization | N/A | **SCHEMA GAP** |

---

## 7. Filtering / Sorting / Search

### 7.1 Projects Page

**Client-side filtering (currently):**
- Status filter tabs (All/Active/Pending/Completed/Blocked)
- Search by name, client, code

**Backend query requirements:**
```
GET /api/projects
  ?status=active|pending|completed|blocked|all
  &search=<text>
  &sort=name|status|progress|priority|end_date
  &order=asc|desc
  &page=1
  &limit=20
```

### 7.2 Requirements Page

**Client-side filtering (currently):**
- Status filter tabs (All/Draft/Pending/In Progress/Review/Approved)
- Search by title, display_id

**Backend query requirements:**
```
GET /api/requirements
  ?project_id=<uuid>
  &status=draft|pending|inProgress|review|approved|all
  &search=<text>
  &category=<category>
  &priority=<priority>
  &assignee_id=<uuid>
  &sprint_id=<uuid>
  &sort=updated_at|priority|title
  &order=asc|desc
  &page=1
  &limit=50
```

### 7.3 Sprint Board

**Client-side view switching:** Kanban vs List

**Backend query requirements:**
```
GET /api/sprints/:id/board
  ?column=backlog|todo|inProgress|review|testing|done
  &priority=<priority>
  &assignee_id=<uuid>
```

### 7.4 Backlog Page

**Client-side filtering:**
- Search by title, display_id

**Backend query requirements:**
```
GET /api/backlog
  ?project_id=<uuid>
  &search=<text>
  &status=<status>
  &sort=rank|priority|story_points
```

### 7.5 Execution Page

**Backend query requirements:**
```
GET /api/tasks/my-work
  ?status=<status>
  &sprint_id=<uuid>

GET /api/tasks/team-work
  ?assignee_id=<uuid>
  &status=<status>
  &priority=<priority>
```

### 7.6 Team Page

**Client-side filtering:**
- Search by name, email

**Backend query requirements:**
```
GET /api/users
  ?search=<text>
  &role=<role>
  &status=<active|inactive>
  &department=<department>
  &sort=name|role|status
```

### 7.7 Notifications Page

**Client-side filtering:**
- Tabs: All, Unread, Tasks, Sprints, Approvals, Documents, System

**Backend query requirements:**
```
GET /api/notifications
  ?type=task|sprint|approval|document|system
  &read=true|false
  &page=1
  &limit=20
```

### 7.8 Documents Page

**Client-side filtering:**
- Folder filter
- Search by name

**Backend query requirements:**
```
GET /api/documents
  ?folder_id=<uuid>
  &search=<text>
  &sort=name|modified|size
```

### 7.9 Governance Pages

**Backend query requirements:**
```
GET /api/governance/budget?project_id=<uuid>
GET /api/governance/contracts?project_id=<uuid>
GET /api/governance/approvals?project_id=<uuid>
GET /api/governance/risks?project_id=<uuid>
GET /api/governance/changes?project_id=<uuid>
```

---

## 8. Dashboard / Analytics

### 8.1 Dashboard Page Metrics

| Metric | Mock Source | Required Entities | Calculation | Implementation |
|--------|-------------|-------------------|-------------|----------------|
| Active Projects | `stats[0]` | projects | COUNT(WHERE status='active') | Database query |
| Team Members | `stats[1]` | users | COUNT(WHERE status='active') | Database query |
| Upcoming Deadlines | `stats[2]` | sprints | COUNT(WHERE end_date BETWEEN now AND now+7) | Database query |
| Need Attention | `stats[3]` | tasks, requirements | COUNT(blocking items) | Database query |
| Recent Projects | `recentProjects` | projects | Latest 4 projects | Database query |
| Recent Activity | `recentActivity` | activity_logs | Latest 4 entries | Database query |
| Active Projects Table | `projects` | projects, users, sprints | Full project list with JOINs | Database query |

### 8.2 Project Detail Metrics

| Metric | Mock Source | Calculation | Implementation |
|--------|-------------|-------------|----------------|
| Progress | `stats[0]` | Already in projects.progress | Direct |
| Current Sprint | `stats[1]` | Active sprint name | Database query |
| Requirements | `stats[2]` | "approved/total" format | COUNT query |
| Budget | `stats[3]` | "$145K/$200K" | **SCHEMA GAP** |
| Actionable Items | `actionableItems` | Needs/wants/approvals | Database query |
| Timeline | `timeline` | SDLC stages | **SCHEMA GAP** |

### 8.3 Monitoring Metrics

| Metric | Mock Source | Calculation | Implementation |
|--------|-------------|-------------|----------------|
| Overall Health | `healthIndicators[0]` | Derived from multiple metrics | API composition |
| Project Progress | `healthIndicators[1]` | projects.progress | Direct |
| Budget Status | `healthIndicators[2]` | Budget analysis | **SCHEMA GAP** |
| Sprint Status | `healthIndicators[3]` | Active sprint status | Direct |
| Requirements % | `healthIndicators[4]` | Approved/total * 100 | COUNT query |
| Current Sprint Overview | `currentSprint` | Sprint metrics | Database query |
| Milestones | `milestones` | Milestone list | **SCHEMA GAP** |
| Upcoming Deadlines | `upcomingDeadlines` | Sprint deadlines | Database query |
| Team Workload | `teamWorkload` | COUNT tasks per user | Database query |
| Risks | `risks` | Risk register | **SCHEMA GAP** |
| Recent Activity | `recentActivity` | activity_logs | Database query |

### 8.4 Reports Metrics

| Metric | Mock Source | Calculation | Implementation |
|--------|-------------|-------------|----------------|
| Sprint Summary | `sprintReport` | Sprint metrics | Database query |
| Team Contribution | `teamContributions` | Per-member task stats | Database aggregation |
| Budget Summary | `budgetReport` | Budget tracking | **SCHEMA GAP** |

### 8.5 AI Recommendations Metrics

| Metric | Mock Source | Calculation | Implementation |
|--------|-------------|-------------|----------------|
| Requirements Analysed | `stats[0]` | COUNT(ai_predictions) | Database query |
| Priority Distribution | `stats[1-3]` | COUNT grouped by suggested_priority | Database query |
| Pending Recommendations | `recommendations` | ai_predictions WHERE status='pending' | Database query |
| Approved Recommendations | `approvedRecommendations` | ai_predictions WHERE status='approved' | Database query |

---

## 9. Authentication / Roles

### 9.1 Role Definitions

The frontend uses 3 application roles defined in the `user_role` enum:

| Role | Enum Value | UI Access |
|------|-----------|-----------|
| Administrator | `ADMIN` | Full access: Team Management, Governance, Settings, all project features |
| Project Manager | `PROJECT_MANAGER` | Project management, Sprint planning, Requirements, Reports, AI Recommendations, Approvals |
| Developer | `DEVELOPER` | Execution workspace, Sprint Board, Tasks, limited project views |

### 9.2 Role-Based UI Access

| Page/Feature | ADMIN | PROJECT_MANAGER | DEVELOPER |
|-------------|-------|----------------|-----------|
| Dashboard (org-wide) | YES | YES | Possibly filtered |
| Projects (all) | YES | YES (managed) | YES (member of) |
| Project Detail | YES | YES | YES |
| Requirements | YES | YES | View only |
| Sprint Planning | YES | YES | NO |
| Sprint Board | YES | YES | YES (own sprint) |
| Backlog | YES | YES | View only |
| Execution | YES | YES | YES (own tasks) |
| Team Management | YES | YES (limited) | NO |
| Governance | YES | YES | NO |
| Documents | YES | YES | YES |
| Reports | YES | YES | View own |
| Monitoring | YES | YES | NO |
| AI Recommendations | YES | YES | NO |
| Settings (org) | YES | NO | NO |
| Settings (profile) | YES | YES | YES |

### 9.3 Frontend Role Assumptions

- The current user is assumed to be "John Smith" (Project Manager) throughout the mock data
- Create Project page assumes the user has project creation permissions
- AI Recommendations page shows "Manager Decision" buttons (Accept/Modify/Reject) — role-gated
- Governance page shows approval workflows — likely admin/PM only
- Team Management shows invite/delete capabilities — likely admin only
- Settings Organization tab — admin only

### 9.4 Auth Integration Requirements

- Supabase Auth for authentication
- Row Level Security (RLS) policies based on `user_role`
- `users.id` maps to `auth.users.id` (existing FK)
- Profile creation trigger on auth signup
- Multi-tenancy via organization concept (SCHEMA GAP)

---

## 10. Storage Requirements

### 10.1 Document Upload

**Page:** Documents (`/documents`)

- Upload button in page header
- Document center with folders
- File types: PDF, DOCX, PNG, MD, XLSX
- File metadata: name, size, version, owner, modified date
- Grid and list view modes

**Storage needs:**
- Supabase Storage bucket for project documents
- Document metadata table (SCHEMA GAP)
- Folder structure (SCHEMA GAP)
- Version tracking (SCHEMA GAP)

### 10.2 Avatar Images

**Pages:** Settings, Team Management

- User avatar display (currently uses initials)
- "Change Avatar" button in Settings
- Accepts JPG, PNG, GIF, max 2MB
- Avatar initials fallback in `users.avatar_initials`

**Storage needs:**
- Supabase Storage bucket for user avatars
- Avatar URL stored on user record (SCHEMA GAP — no avatar_url column)

### 10.3 Exports/Downloads

**Pages:** Dashboard, Projects, Requirements, Reports, Governance, Team

- Export buttons on most list pages (PDF, Excel, CSV)
- Report center has explicit PDF/Excel/CSV buttons
- These are client-side generation or future API features

**Storage needs:** None for storage — these are generation/download features.

---

## 11. Realtime Requirements

### 11.1 Apparent Realtime Needs

| Feature | Page | Realtime Signal | Priority |
|---------|------|----------------|----------|
| Activity Feed | Dashboard, Project Detail, Execution, Monitoring | New activity items appearing | Medium |
| Notifications | Notifications page, TopNavigation badge | New notification count | High |
| Sprint Board | Sprint Board | Task column changes by team members | High |
| Task Status | Execution | Team task status updates | Medium |
| Dashboard Stats | Dashboard | Project counts, deadlines changing | Low |
| Monitoring Health | Monitoring | Health indicators changing | Low |
| AI Recommendations | AI Recommendations | New analysis results | Medium |

### 11.2 Realtime Architecture Considerations

- **Notifications:** Supabase Realtime on `notifications` table, filtered by `user_id`
- **Activity:** Supabase Realtime on `activity_logs` table, filtered by `project_id`
- **Tasks:** Supabase Realtime on `tasks` table, filtered by `sprint_id`
- **Dashboard:** Periodic polling may be sufficient

---

## 12. Schema Gaps

The following items are required by the frontend but have **no corresponding database table or column** in the current schema.

### 12.1 Missing Tables

| Gap | UI Location | Required Fields | Priority |
|-----|-------------|----------------|----------|
| `documents` | Documents page | id, name, type, size, owner_id, folder_id, version, modified_at | High |
| `folders` | Documents page | id, name, project_id, parent_id | High |
| `budgets` / `budget_categories` | Governance, Reports, Create Project | id, project_id, category, allocated, spent, status | High |
| `contracts` | Governance page | id, name, vendor, value, status, expiry, project_id | Medium |
| `approvals` | Governance page | id, title, requester_id, type, status, requested_date, project_id | Medium |
| `risks` | Governance, Monitoring | id, title, probability, impact, owner_id, mitigation, project_id | Medium |
| `change_requests` | Governance page | id, title, type, impact, status, requester_id, date, project_id | Medium |
| `milestones` | Monitoring, Create Project | id, name, date, status, project_id | Medium |
| `calendar_events` | Calendar page | id, title, date, time, type, project_id | Medium |
| `organizations` | Settings | id, name, url, industry, timezone | High |
| `user_preferences` | Settings | user_id, theme, sidebar, notification_settings | Low |

### 12.2 Missing Columns

| Gap | Table | Required Column | UI Location | Priority |
|-----|-------|----------------|-------------|----------|
| Project description | projects | `description` (text) | Project Detail | High |
| Project start_date | projects | `start_date` (date) | Project Detail, Create | High |
| Project budget_total | projects | `budget_total` (numeric) | Reports, Governance | Medium |
| Task due_date | tasks | `due_date` (date) | Execution | High |
| Task progress | tasks | `progress` (integer) | Execution | Medium |
| User job_title | users | `job_title` (text) | Settings, Team | Low |
| User avatar_url | users | `avatar_url` (text) | Settings, throughout | Medium |
| User last_active_at | users | `last_active_at` (timestamp) | Team page | Low |
| User organization_id | users | `organization_id` (FK) | Multi-tenancy | High |
| AI prediction approved_by | ai_predictions | `approved_by` (FK→users) | AI Recommendations | Medium |
| AI prediction approved_at | ai_predictions | `approved_at` (timestamp) | AI Recommendations | Medium |
| Sprint velocity | sprints | `velocity` (integer) | Reports | Low — can be derived |

### 12.3 Missing Enums

| Gap | Required Values | UI Location |
|-----|----------------|-------------|
| Budget status | ontrack, overbudget, at_risk | Governance |
| Contract status | active, pending, expired, terminated | Governance |
| Approval type | scope, budget, vendor, resource | Governance |
| Approval status | pending, approved, rejected | Governance |
| Risk probability | high, medium, low | Governance, Monitoring |
| Risk impact | high, medium, low | Governance, Monitoring |
| Change request type | feature, technical, process | Governance |
| Change request impact | high, medium, low | Governance |
| Milestone status | completed, current, upcoming | Monitoring |
| Calendar event type | sprint, meeting, milestone, deadline, document | Calendar |
| Document type | pdf, doc, image, code, spreadsheet, other | Documents |

---

## 13. Recommended Next Steps

### 13.1 Database/Schema Agent

1. **High Priority — Add missing core columns:**
   - `projects.description` (text)
   - `projects.start_date` (date)
   - `tasks.due_date` (date)
   - `users.organization_id` (FK → organizations)

2. **High Priority — Create Organizations table:**
   - The multi-tenancy model is fundamental to the application
   - Users need to belong to an organization
   - Settings page requires org settings

3. **High Priority — Create Documents/Folders tables:**
   - Document center is a core feature with full UI
   - Storage buckets need metadata tables

4. **Medium Priority — Create Governance tables:**
   - Budget categories
   - Contracts
   - Approvals
   - Risks
   - Change requests
   - Milestones

5. **Medium Priority — Create Calendar Events table:**
   - Full calendar UI exists

6. **Low Priority — Add remaining columns:**
   - `tasks.progress`
   - `users.job_title`
   - `users.avatar_url`
   - `users.last_active_at`
   - `ai_predictions.approved_by`, `ai_predictions.approved_at`

### 13.2 Seed Data Agent

- Generate realistic seed data matching the mock data patterns
- Projects: 5-10 projects with various statuses
- Requirements: 15-20 requirements with diverse categories
- Sprints: 4-6 sprints per project
- Tasks: 30-50 tasks distributed across sprints
- Users: 8-10 users with different roles and departments
- Teams: 3-4 teams

### 13.3 API Agent

- Build APIs matching the filtering/query requirements documented in Section 7
- Ensure response shapes match frontend field expectations documented in Section 4
- Implement aggregation endpoints for derived metrics documented in Section 5

### 13.4 AI Agent

- Connect AI predictions table to the AI Recommendations page
- Implement approval workflow for recommendations
- Ensure reasoning (jsonb) format matches frontend expectation (array of strings)
