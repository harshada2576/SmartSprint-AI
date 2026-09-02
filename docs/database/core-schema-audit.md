# Core Database & Multi-Tenancy Architecture Audit

Audit of the SmartSprint AI database model for frontend compatibility, multi-tenancy, and architectural soundness.

Generated: 2026-09-02

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Existing Tables Analysis](#2-existing-tables-analysis)
3. [Frontend Compatibility Matrix](#3-frontend-compatibility-matrix)
4. [Organizations & Multi-Tenancy](#4-organizations--multi-tenancy)
5. [Roles Architecture](#5-roles-architecture)
6. [Relationship Audit](#6-relationship-audit)
7. [Missing Columns Evaluation](#7-missing-columns-evaluation)
8. [AI Predictions Evaluation](#8-ai-predictions-evaluation)
9. [Schema Anomalies](#9-schema-anomalies)
10. [Proposed Logical ER Structure](#10-proposed-logical-er-structure)
11. [Change Classification](#11-change-classification)

---

## 1. Executive Summary

The current schema (`supabase/schema.ts`) defines **12 tables** and **13 enums**. It covers the core CRUD flow well: projects, requirements, sprints, tasks, backlog, teams, users, invitations, activity logs, notifications, AI predictions, and their join tables.

**Key findings:**

- The core entity model is **structurally sound** — relationships, foreign keys, indexes, and cascades are well-designed.
- There is **no organization/tenant concept**, which is the single most critical gap for multi-tenancy.
- The `users.role` column is **globally scoped** — it should be scoped per organization and optionally per project.
- **5 tables** are missing entirely (organizations, documents/folders, budgets, approvals/governance).
- **~12 columns** are missing from existing tables that the frontend requires.
- The `ai_predictions` table lacks approval audit fields (`approved_by`, `approved_at`).
- The `users` self-referential foreign key on `id` is an error that should be removed.
- The schema has no `organization_id` on any table, making tenant isolation impossible.

---

## 2. Existing Tables Analysis

### 2.1 `users`

**Purpose:** Stores user profiles linked to Supabase Auth.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid PK | NOT NULL | — | References `auth.users` (via self-reference, see anomaly) |
| `first_name` | text | NOT NULL | — | |
| `last_name` | text | NOT NULL | — | |
| `email` | text | NOT NULL | — | Unique |
| `role` | user_role enum | NOT NULL | DEVELOPER | **Problematic: global scope** |
| `department` | text | nullable | — | |
| `status` | user_status enum | NOT NULL | active | |
| `avatar_initials` | text | nullable | — | Derived from name |
| `created_at` | timestamptz | NOT NULL | now() | |
| `updated_at` | timestamptz | NOT NULL | now() | |

**Strengths:**
- Clean minimal profile schema.
- Status enum supports active/inactive lifecycle.
- Unique email constraint.

**Problems:**
- `role` is global — cannot differ per org or per project.
- Missing `organization_id` — no tenant isolation.
- Missing `job_title`, `avatar_url`, `last_active_at` — all required by frontend.
- Self-referential FK on `id` (`users_id_fkey` → `users.id`) is an error — this appears to be a Drizzle artifact attempting to model the `auth.users` FK but instead creating a self-reference. This FK should reference `auth.users(id)` via a separate mechanism or be removed.
- No `phone` field (not required by frontend but common).

**Frontend coverage:** ~60% — missing `job_title`, `avatar_url`, `last_active_at`, `organization_id`.

---

### 2.2 `teams`

**Purpose:** Named groups of users within a project/organization.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid PK | NOT NULL | auto | |
| `name` | text | NOT NULL | — | |
| `lead_id` | uuid FK | nullable | — | → users.id, ON DELETE set null |
| `created_at` | timestamptz | NOT NULL | now() | |

**Strengths:**
- Simple and clean.
- Lead is nullable (team can exist without a lead).

**Problems:**
- Missing `organization_id` — teams should be scoped to an org.
- Missing `description` (nice-to have).
- No `updated_at` column.

**Frontend coverage:** ~70% — missing org scoping.

---

### 2.3 `projects`

**Purpose:** Core project entity.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid PK | NOT NULL | auto | |
| `name` | text | NOT NULL | — | |
| `code` | text | nullable | — | Unique |
| `client` | text | nullable | — | |
| `manager_id` | uuid FK | nullable | — | → users.id, ON DELETE set null |
| `method` | project_method enum | NOT NULL | scrum | |
| `status` | project_status enum | NOT NULL | pending | |
| `priority` | priority_level enum | NOT NULL | medium | |
| `progress` | integer | NOT NULL | 0 | CHECK 0–100 |
| `end_date` | date | nullable | — | |
| `created_at` | timestamptz | NOT NULL | now() | |
| `updated_at` | timestamptz | NOT NULL | now() | |

**Strengths:**
- Good enum coverage for method, status, priority.
- Progress constraint (0–100).
- Index on `manager_id`.
- Unique code constraint.

**Problems:**
- Missing `description` — frontend Project Detail page shows it.
- Missing `start_date` — frontend Create Project and Detail pages require it.
- Missing `budget_total` — frontend Reports and Governance pages show budget summary per project.
- Missing `organization_id` — no tenant isolation.
- `code` is nullable but the frontend always shows it.

**Frontend coverage:** ~55% — missing `description`, `start_date`, `budget_total`.

---

### 2.4 `sprints`

**Purpose:** Time-boxed iteration within a project.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid PK | NOT NULL | auto | |
| `project_id` | uuid FK | NOT NULL | — | → projects.id, ON DELETE cascade |
| `name` | text | NOT NULL | — | |
| `goal` | text | nullable | — | |
| `status` | sprint_status enum | NOT NULL | planning | |
| `start_date` | date | nullable | — | |
| `end_date` | date | nullable | — | |
| `total_points` | integer | nullable | — | |
| `completed_points` | integer | nullable | — | |
| `created_at` | timestamptz | NOT NULL | now() | |
| `updated_at` | timestamptz | NOT NULL | now() | |

**Strengths:**
- Clean project FK with cascade delete.
- Status lifecycle (planning → active → completed/cancelled).
- Points tracking for velocity.

**Problems:**
- `total_points` and `completed_points` are nullable — should default to 0 or be computed.
- No `velocity` column (but this is derivable, so likely acceptable).
- Frontend expects `sprint.duration` (computed string "2 weeks") — derivable from dates.

**Frontend coverage:** ~90% — well mapped.

---

### 2.5 `requirements`

**Purpose:** Project requirements with rich metadata.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid PK | NOT NULL | auto | |
| `display_id` | text | nullable | — | Unique, e.g. "REQ-001" |
| `project_id` | uuid FK | NOT NULL | — | → projects.id, ON DELETE cascade |
| `title` | text | NOT NULL | — | |
| `description` | text | nullable | — | |
| `category` | requirement_category enum | NOT NULL | — | |
| `business_value` | priority_level enum | NOT NULL | medium | Reuses priority_level |
| `customer_importance` | integer | nullable | — | AI scoring field |
| `urgency` | integer | nullable | — | AI scoring field |
| `complexity` | integer | nullable | — | AI scoring field |
| `estimated_effort` | integer | nullable | — | |
| `risk` | integer | nullable | — | |
| `story_points` | integer | nullable | — | |
| `dependency_id` | uuid FK | nullable | — | Self-ref → requirements.id |
| `priority` | priority_level enum | NOT NULL | medium | |
| `status` | requirement_status enum | NOT NULL | draft | |
| `assignee_id` | uuid FK | nullable | — | → users.id |
| `sprint_id` | uuid FK | nullable | — | → sprints.id |
| `created_at` | timestamptz | NOT NULL | now() | |
| `updated_at` | timestamptz | NOT NULL | now() | |

**Strengths:**
- Comprehensive AI-scoring fields (`customer_importance`, `urgency`, `complexity`, `estimated_effort`, `risk`).
- Self-referential dependency support.
- Good index coverage (assignee, project, sprint).
- Display ID support for human-readable references.
- Status lifecycle with 7 states.

**Problems:**
- `display_id` is nullable — should be auto-generated and NOT NULL.
- `business_value` reuses `priority_level` enum — conceptually different (business value ≠ priority).
- No `acceptance_criteria` field (common in requirement management).

**Frontend coverage:** ~85% — strong mapping.

---

### 2.6 `tasks`

**Purpose:** Work items within sprints.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid PK | NOT NULL | auto | |
| `display_id` | text | nullable | — | Unique, e.g. "TASK-101" |
| `sprint_id` | uuid FK | nullable | — | → sprints.id |
| `requirement_id` | uuid FK | nullable | — | → requirements.id |
| `project_id` | uuid FK | NOT NULL | — | → projects.id, ON DELETE cascade |
| `title` | text | NOT NULL | — | |
| `priority` | priority_level enum | NOT NULL | medium | |
| `points` | integer | nullable | — | |
| `assignee_id` | uuid FK | nullable | — | → users.id |
| `column_status` | task_column_status enum | NOT NULL | backlog | |
| `created_at` | timestamptz | NOT NULL | now() | |
| `updated_at` | timestamptz | NOT NULL | now() | |

**Strengths:**
- Dual FK to both sprint and project (allows backlog tasks without sprint).
- Column status with 6 Kanban states.
- Good index coverage.
- Requirement linkage for traceability.

**Problems:**
- Missing `due_date` — frontend Execution page shows due dates per task.
- Missing `progress` — frontend Execution page shows task-level progress percentages.
- Missing `description` — useful for task details.
- `display_id` is nullable — should be auto-generated and NOT NULL.
- No `estimated_hours` / `actual_hours` (frontend Reports page shows hours per team member).

**Frontend coverage:** ~70% — missing `due_date`, `progress`.

---

### 2.7 `backlog`

**Purpose:** Rank-ordered product backlog linking to requirements.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid PK | NOT NULL | auto | |
| `project_id` | uuid FK | nullable | — | → projects.id, ON DELETE cascade |
| `requirement_id` | uuid FK | NOT NULL | — | → requirements.id, ON DELETE cascade, Unique |
| `rank` | integer | NOT NULL | — | |
| `created_at` | timestamptz | NOT NULL | now() | |

**Strengths:**
- Clean rank-based ordering.
- Unique constraint on requirement_id (one backlog entry per requirement).
- Cascade deletes from both project and requirement.

**Problems:**
- `project_id` is nullable — should be NOT NULL (every backlog entry belongs to a project; it's redundant with the requirement's project, but useful for direct queries).
- No `updated_at` column.

**Frontend coverage:** ~90% — maps well to backlog page.

---

### 2.8 `ai_predictions`

**Purpose:** AI-generated prioritization and scheduling recommendations for requirements.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid PK | NOT NULL | auto | |
| `requirement_id` | uuid FK | NOT NULL | — | → requirements.id, ON DELETE cascade |
| `suggested_priority` | priority_level enum | nullable | — | |
| `suggested_sprint_id` | uuid FK | nullable | — | → sprints.id |
| `confidence_score` | numeric(5,2) | nullable | — | CHECK 0–100 |
| `summary` | text | nullable | — | |
| `reasoning` | jsonb | nullable | — | Array of strings |
| `recommendation_status` | recommendation_status enum | NOT NULL | pending | |
| `created_at` | timestamptz | NOT NULL | now() | |

**Strengths:**
- Good confidence score with CHECK constraint.
- JSONB reasoning for flexible AI output.
- Clean status lifecycle (pending → approved/rejected).
- Links to both requirement and suggested sprint.

**Problems:**
- Missing `approved_by` (FK → users) — frontend shows "Approved By" on approved recommendations.
- Missing `approved_at` (timestamp) — frontend shows "Approved Date".
- No `project_id` — requires JOIN through requirements to filter by project.
- No `updated_at` — cannot track when status changed.
- Confidence score is nullable — should be NOT NULL for AI predictions.

**Frontend coverage:** ~75% — missing approval audit fields.

---

### 2.9 `activity_logs`

**Purpose:** Audit trail of actions across the system.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid PK | NOT NULL | auto | |
| `project_id` | uuid FK | nullable | — | → projects.id, ON DELETE set null |
| `user_id` | uuid FK | nullable | — | → users.id, ON DELETE set null |
| `action` | text | NOT NULL | — | |
| `value` | text | nullable | — | |
| `entity_type` | text | nullable | — | e.g. "requirement", "task", "sprint" |
| `entity_id` | uuid | nullable | — | Polymorphic reference |
| `created_at` | timestamptz | NOT NULL | now() | |

**Strengths:**
- Polymorphic entity reference (entity_type + entity_id).
- Both project and user context.
- Good index on project_id.

**Problems:**
- `entity_type` is plain text — should be an enum for consistency and RLS.
- `action` is plain text — should be an enum (e.g. "created", "updated", "approved", "completed").
- No `organization_id` — cannot filter activity by tenant.

**Frontend coverage:** ~80% — functional but lacks typed enums.

---

### 2.10 `notifications`

**Purpose:** Per-user notification inbox.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid PK | NOT NULL | auto | |
| `user_id` | uuid FK | NOT NULL | — | → users.id, ON DELETE cascade |
| `type` | text | NOT NULL | — | |
| `title` | text | NOT NULL | — | |
| `description` | text | nullable | — | |
| `priority` | priority_level enum | NOT NULL | medium | |
| `read` | boolean | NOT NULL | false | |
| `action_label` | text | nullable | — | |
| `created_at` | timestamptz | NOT NULL | now() | |

**Strengths:**
- Clean user-scoped notifications.
- Read/unread tracking.
- Priority levels.
- Action label for CTA buttons.
- Cascade delete on user removal.
- Good index on user_id.

**Problems:**
- `type` is plain text — should be an enum for consistency.
- No `entity_type` / `entity_id` for linking notifications to specific objects.
- No `organization_id`.

**Frontend coverage:** ~85% — well mapped to notifications page.

---

### 2.11 `team_members`

**Purpose:** Many-to-many join between teams and users.

| Column | Type | Notes |
|--------|------|-------|
| `team_id` | uuid FK NOT NULL | → teams.id, ON DELETE cascade |
| `user_id` | uuid FK NOT NULL | → users.id, ON DELETE cascade |

**Composite PK:** (team_id, user_id)

**Strengths:**
- Proper composite primary key.
- Cascade deletes from both sides.
- Clean join table.

**Problems:**
- No `role` column — team members could have different roles within a team (e.g. "lead", "member"). However, the `teams.lead_id` handles the lead concept, so this may be acceptable.

**Frontend coverage:** ~95%.

---

### 2.12 `project_members`

**Purpose:** Many-to-many join between projects and users.

| Column | Type | Notes |
|--------|------|-------|
| `project_id` | uuid FK NOT NULL | → projects.id, ON DELETE cascade |
| `user_id` | uuid FK NOT NULL | → users.id, ON DELETE cascade |

**Composite PK:** (project_id, user_id)

**Strengths:**
- Proper composite primary key.
- Good index on user_id.
- Cascade deletes.

**Problems:**
- No `role` column — a user could be "developer" in one project and "reviewer" in another. The current design relies on the global `users.role`, which cannot express per-project roles.
- No `joined_at` timestamp.

**Frontend coverage:** ~90%.

---

### 2.13 `invitations`

**Purpose:** Pending user invitations to the organization.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid PK | NOT NULL | auto | |
| `email` | text | NOT NULL | — | |
| `role` | user_role enum | NOT NULL | — | |
| `status` | invitation_status enum | NOT NULL | pending | |
| `invited_by` | uuid FK | nullable | — | → users.id, ON DELETE set null |
| `created_at` | timestamptz | NOT NULL | now() | |

**Strengths:**
- Clean invitation lifecycle.
- Status enum with 4 states.
- Tracks who sent the invitation.

**Problems:**
- Missing `organization_id` — invitations should be scoped to an org.
- Missing `expires_at` — invitations should expire.
- No `token` for invitation links.

**Frontend coverage:** ~80%.

---

## 3. Frontend Compatibility Matrix

### 3.1 Field-Level Coverage

| Frontend Entity | Required Fields | Covered | Missing | Coverage |
|----------------|----------------|---------|---------|----------|
| **Project** | id, name, code, client, status, progress, priority, method, endDate, description, startDate, manager, team, sprint, budget | 10 | 3 (description, startDate, budget) | 67% |
| **Requirement** | id, displayId, title, category, businessValue, status, priority, sprint, assignee, lastUpdated, storyPoints, dependencies | 12 | 0 | 100% |
| **Sprint** | id, name, goal, status, startDate, endDate, totalPoints, completedPoints, progress, remainingDays | 8 | 0 (2 derived) | 100% |
| **Task** | displayId, title, priority, points, columnStatus, assignee, sprint, project, dueDate, progress, updated | 8 | 2 (dueDate, progress) | 73% |
| **User** | id, name, email, role, department, status, avatarInitials, projects, lastActive, jobTitle, avatarUrl | 7 | 3 (lastActive, jobTitle, avatarUrl) | 64% |
| **Team** | id, name, members, lead | 4 | 0 | 100% |
| **Notification** | id, type, title, description, priority, read, action, time | 8 | 0 | 100% |
| **Activity Log** | action, value, entityType, entityId, user, project, time | 5 | 0 (2 via JOIN) | 100% |
| **AI Prediction** | requirement, category, status, suggestedPriority, suggestedSprint, confidence, summary, reasoning, recStatus, approvedBy, approvedDate | 9 | 2 (approvedBy, approvedDate) | 82% |
| **Backlog** | id, priority, title, storyPoints, sprint, status, owner, category | 6 | 0 (2 via JOIN) | 100% |
| **Invitation** | id, email, role, sent, status | 5 | 0 | 100% |
| **Organization** | id, name, url, industry, timezone | 0 | 5 | 0% |
| **Document** | id, name, type, size, owner, modified, version, folder | 0 | 8 | 0% |
| **Folder** | id, name, count | 0 | 3 | 0% |
| **Budget** | id, category, allocated, spent, remaining, status | 0 | 6 | 0% |
| **Contract** | id, name, vendor, value, status, expiry | 0 | 6 | 0% |
| **Approval** | id, title, requester, type, status, requested | 0 | 6 | 0% |
| **Risk** | id, title, probability, impact, owner, mitigation | 0 | 6 | 0% |
| **Change Request** | id, title, type, impact, status, requester, date | 0 | 7 | 0% |
| **Milestone** | id, name, date, status | 0 | 4 | 0% |
| **Calendar Event** | id, title, date, type, time | 0 | 5 | 0% |

### 3.2 Derived Values (Should NOT Be Stored)

The following frontend fields are computed and should be calculated at the API layer:

| Field | Calculation | Stored? | Should Store? |
|-------|-------------|---------|---------------|
| Sprint progress % | `(completed_points / total_points) * 100` | No | No — derive |
| Sprint remaining days | `end_date - CURRENT_DATE` | No | No — derive |
| Sprint velocity | Last completed sprint's `completed_points` | No | No — query |
| Column task counts | `COUNT(tasks WHERE column_status = X)` | No | No — query |
| Project team size | `COUNT(project_members)` | No | No — query |
| Requirements ratio | `COUNT(approved) / COUNT(total)` | No | No — query |
| User project count | `COUNT(project_members WHERE user_id = X)` | No | No — query |
| Team member count | `COUNT(team_members WHERE team_id = X)` | No | No — query |
| Filter counts | `COUNT(GROUP BY status)` | No | No — query |
| Contribution % | `member_points / total_sprint_points` | No | No — query |
| Budget remaining | `allocated - spent` | No | No — derive |
| Budget variance | `((spent - allocated) / allocated) * 100` | No | No — derive |

---

## 4. Organizations & Multi-Tenancy

### 4.1 Current State

There is **no organization concept** in the schema. Every table exists in a single-tenant flat namespace. This is the most critical architectural gap.

The frontend Settings page (`/settings`) has an "Organization" tab with fields:
- `orgName` — "Acme Corporation"
- `orgUrl` — "acme-corp"
- `industry` — "Technology"
- `timezone` — "Eastern Time"

The frontend Team page shows users and teams that logically belong to an organization.

### 4.2 Required Multi-Tenant Model

```
organizations
 ├── id (uuid PK)
 ├── name (text NOT NULL)
 ├── slug (text UNIQUE) — for URL-friendly identifier
 ├── industry (text)
 ├── timezone (text)
 ├── created_at, updated_at
 │
 ├── organization_members (join table)
 │    ├── organization_id (FK → organizations)
 │    ├── user_id (FK → users)
 │    ├── role (org_role enum: OWNER, ADMIN, MEMBER)
 │    ├── created_at
 │    └── PK: (organization_id, user_id)
 │
 └── All tenant-scoped tables reference organization_id:
      ├── projects
      ├── teams
      ├── invitations
      ├── documents/folders
      ├── budgets, contracts, approvals, risks, change_requests
      └── activity_logs, notifications
```

### 4.3 Organization Membership Design

**Recommended: Membership table (`organization_members`)**

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| `users.organization_id` directly | Simple | Users can only belong to ONE org | **REJECT** — too limiting |
| `organization_members` join table | Users can belong to multiple orgs; role per org | Extra table, slightly more complex | **ADOPT** |
| Hybrid (FK + join table) | Quick org lookup on user | Redundant, sync issues | **REJECT** |

**Justification:** A membership table is the standard pattern for SaaS multi-tenancy. It supports:
- Users belonging to multiple organizations (consultants, contractors).
- Per-organization roles (OWNER, ADMIN, MEMBER).
- Clean RLS policies via `organization_id` lookups.
- Future B2B features.

### 4.4 Tenant Isolation Strategy

Every tenant-scoped table needs an `organization_id` column with an RLS policy:

```sql
-- Example RLS policy
CREATE POLICY "org_isolation" ON projects
  USING (organization_id = (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  ));
```

**Tables requiring `organization_id`:**

| Table | Currently Scoped By | Needs Org FK? |
|-------|-------------------|---------------|
| `projects` | Nothing | **YES** |
| `teams` | Nothing | **YES** |
| `invitations` | Nothing (invited_by user) | **YES** |
| `activity_logs` | project_id (indirect) | **YES** (for cross-project queries) |
| `documents` | (doesn't exist) | **YES** (when created) |
| `budgets` | (doesn't exist) | **YES** (when created) |

**Tables that do NOT need `organization_id`:**

| Table | Reason |
|-------|--------|
| `users` | Scoped via `organization_members` join |
| `sprints` | Scoped via `projects.organization_id` |
| `requirements` | Scoped via `projects.organization_id` |
| `tasks` | Scoped via `projects.organization_id` |
| `backlog` | Scoped via `projects.organization_id` or `requirements` |
| `team_members` | Scoped via `teams.organization_id` |
| `project_members` | Scoped via `projects.organization_id` |
| `notifications` | Scoped via `user_id` |
| `ai_predictions` | Scoped via `requirements.project_id` |

---

## 5. Roles Architecture

### 5.1 Current Design

```sql
user_role enum: ['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER']
```

Stored on `users.role` — a single global role per user.

### 5.2 Problems

1. **Global scope:** A user who is ADMIN in Org A cannot be DEVELOPER in Org B.
2. **No per-project roles:** A user might be PROJECT_MANAGER globally but DEVELOPER on a specific project.
3. **Frontend shows a "Viewer" role** in the team page roles list, but the enum only has 3 values.
4. **The team page shows role descriptions** ("Full Access", "Project Management", "Development Tasks", "Read Only") — these are permission summaries, not stored anywhere.

### 5.3 Recommended Design

**Multi-level role architecture:**

```
Organization Level:
  organization_members.role → org_role enum: ['OWNER', 'ADMIN', 'MEMBER']

Project Level (optional override):
  project_members.role → project_role enum: ['MANAGER', 'DEVELOPER', 'VIEWER']
```

**Resolution logic:**
1. Check `project_members.role` first (project-specific override).
2. Fall back to `organization_members.role` (org-level default).
3. `OWNER` and `ADMIN` at org level have full access to all projects.

**What to keep from current schema:**
- The `users.role` column should be **removed** or **repurposed** as a legacy/default role.
- Move role assignment to `organization_members.role` and optionally `project_members.role`.

### 5.4 Frontend Role Mapping

| Frontend Role | Org Level | Project Level |
|--------------|-----------|---------------|
| Administrator | OWNER or ADMIN | Any |
| Project Manager | MEMBER | MANAGER |
| Developer | MEMBER | DEVELOPER |
| Viewer (shown in UI) | MEMBER | VIEWER |

### 5.5 Uncertainty

**⚠ UNCERTAINTY:** The frontend Team page shows a "Viewer" role with "Read Only" permissions. The current enum does not include VIEWER. It's unclear whether this is:
- (a) A planned but unimplemented role, or
- (b) A display-only artifact of the mock data.

**Recommendation:** Add VIEWER to the project_role enum to support read-only access. This is a common SaaS pattern.

---

## 6. Relationship Audit

### 6.1 Foreign Key Matrix

| Source Table | Column | Target Table | On Delete | Assessment |
|-------------|--------|-------------|-----------|------------|
| `users.id` | id | `users.id` (self) | cascade | **ERROR** — should reference `auth.users` |
| `teams.lead_id` | lead_id | `users.id` | set null | ✅ Correct |
| `projects.manager_id` | manager_id | `users.id` | set null | ✅ Correct |
| `sprints.project_id` | project_id | `projects.id` | cascade | ✅ Correct |
| `requirements.project_id` | project_id | `projects.id` | cascade | ✅ Correct |
| `requirements.assignee_id` | assignee_id | `users.id` | set null | ✅ Correct |
| `requirements.dependency_id` | dependency_id | `requirements.id` | set null | ✅ Correct |
| `requirements.sprint_id` | sprint_id | `sprints.id` | set null | ✅ Correct |
| `backlog.project_id` | project_id | `projects.id` | cascade | ✅ Correct |
| `backlog.requirement_id` | requirement_id | `requirements.id` | cascade | ✅ Correct |
| `tasks.sprint_id` | sprint_id | `sprints.id` | set null | ✅ Correct |
| `tasks.requirement_id` | requirement_id | `requirements.id` | set null | ✅ Correct |
| `tasks.project_id` | project_id | `projects.id` | cascade | ✅ Correct |
| `tasks.assignee_id` | assignee_id | `users.id` | set null | ✅ Correct |
| `ai_predictions.requirement_id` | requirement_id | `requirements.id` | cascade | ✅ Correct |
| `ai_predictions.suggested_sprint_id` | suggested_sprint_id | `sprints.id` | set null | ✅ Correct |
| `activity_logs.project_id` | project_id | `projects.id` | set null | ✅ Correct |
| `activity_logs.user_id` | user_id | `users.id` | set null | ✅ Correct |
| `notifications.user_id` | user_id | `users.id` | cascade | ✅ Correct |
| `invitations.invited_by` | invited_by | `users.id` | set null | ✅ Correct |
| `team_members.team_id` | team_id | `teams.id` | cascade | ✅ Correct |
| `team_members.user_id` | user_id | `users.id` | cascade | ✅ Correct |
| `project_members.project_id` | project_id | `projects.id` | cascade | ✅ Correct |
| `project_members.user_id` | user_id | `users.id` | cascade | ✅ Correct |

### 6.2 Cardinality Assessment

| Relationship | Expected | Actual | Assessment |
|-------------|----------|--------|------------|
| Project → Manager | Many:1 | Many:1 (nullable FK) | ✅ Correct |
| Project → Members | Many:Many | Many:Many (join table) | ✅ Correct |
| Project → Requirements | 1:Many | 1:Many (FK on requirements) | ✅ Correct |
| Project → Sprints | 1:Many | 1:Many (FK on sprints) | ✅ Correct |
| Sprint → Tasks | 1:Many | 1:Many (FK on tasks, nullable) | ✅ Correct |
| Task → Assignee | Many:1 | Many:1 (nullable FK) | ✅ Correct |
| Task → Requirement | Many:1 | Many:1 (nullable FK) | ✅ Correct |
| Task → Project | Many:1 | Many:1 (NOT NULL FK) | ✅ Correct |
| Requirement → Assignee | Many:1 | Many:1 (nullable FK) | ✅ Correct |
| Requirement → Sprint | Many:1 | Many:1 (nullable FK) | ✅ Correct |
| Requirement → Dependency | Many:1 (self) | Many:1 (nullable self FK) | ✅ Correct |
| Team → Lead | Many:1 | Many:1 (nullable FK) | ✅ Correct |
| Team → Members | Many:Many | Many:Many (join table) | ✅ Correct |
| AI Prediction → Requirement | Many:1 | Many:1 (NOT NULL FK) | ✅ Correct |
| AI Prediction → Sprint | Many:1 | Many:1 (nullable FK) | ✅ Correct |
| Notification → User | Many:1 | Many:1 (NOT NULL FK) | ✅ Correct |
| Invitation → Inviter | Many:1 | Many:1 (nullable FK) | ✅ Correct |
| Backlog → Project | Many:1 | Many:1 (nullable FK) | ⚠ Should be NOT NULL |
| Backlog → Requirement | 1:1 | 1:1 (unique FK) | ✅ Correct |

### 6.3 Missing Relationships

| Relationship | Frontend Requires | Status |
|-------------|------------------|--------|
| Organization → Projects | Multi-tenancy | **MISSING** |
| Organization → Teams | Multi-tenancy | **MISSING** |
| Organization → Users (via members) | Multi-tenancy | **MISSING** |
| Organization → Invitations | Multi-tenancy | **MISSING** |
| Document → Project | Documents page | **MISSING** (table doesn't exist) |
| Document → Folder | Documents page | **MISSING** (table doesn't exist) |
| Budget → Project | Governance page | **MISSING** (table doesn't exist) |
| Approval → Project | Governance page | **MISSING** (table doesn't exist) |
| Risk → Project | Governance/Monitoring | **MISSING** (table doesn't exist) |
| Change Request → Project | Governance page | **MISSING** (table doesn't exist) |
| Milestone → Project | Monitoring page | **MISSING** (table doesn't exist) |
| Calendar Event → Project | Calendar page | **MISSING** (table doesn't exist) |
| AI Prediction → User (approved_by) | AI Recommendations | **MISSING** column |

---

## 7. Missing Columns Evaluation

### 7.1 Projects Table

#### `description` (text)

| Attribute | Value |
|-----------|-------|
| **Required?** | Yes |
| **Reason** | Frontend Project Detail page displays project description. Create Project form has a description textarea. |
| **Recommended type** | `text` |
| **Nullable?** | Yes (existing projects may not have it) |
| **Default?** | `null` |

#### `start_date` (date)

| Attribute | Value |
|-----------|-------|
| **Required?** | Yes |
| **Reason** | Frontend Create Project form has a Start Date field. Project Detail page displays "Jan 15" start dates. SDLC timeline shows start date. |
| **Recommended type** | `date` |
| **Nullable?** | Yes (allows phased project creation) |
| **Default?** | `null` |

#### `budget_total` (numeric)

| Attribute | Value |
|-----------|-------|
| **Required?** | Medium |
| **Reason** | Frontend Reports page shows "$145K/$200K" budget summary. Governance page has budget tracking. |
| **Recommended type** | `numeric(12,2)` |
| **Nullable?** | Yes |
| **Default?** | `null` |
| **Note** | Could alternatively be stored in a separate `budgets` table for per-category tracking. Storing a total on the project is a summary shortcut. Both are recommended. |

### 7.2 Tasks Table

#### `due_date` (date)

| Attribute | Value |
|-----------|-------|
| **Required?** | Yes |
| **Reason** | Frontend Execution page shows `dueDate` per task ("2025-07-25"). Task cards display due dates. |
| **Recommended type** | `date` |
| **Nullable?** | Yes (not all tasks have due dates) |
| **Default?** | `null` |

#### `progress` (integer)

| Attribute | Value |
|-----------|-------|
| **Required?** | Medium |
| **Reason** | Frontend Execution page shows task-level progress percentages (65%, 90%, 40%, 10%, 100%). |
| **Recommended type** | `integer` |
| **Nullable?** | Yes |
| **Default?** | `0` |
| **CHECK** | `(progress >= 0) AND (progress <= 100)` |
| **Note** | Progress could alternatively be derived from `column_status` (e.g., backlog=0%, todo=10%, inProgress=50%, done=100%). Storing it explicitly gives more granular control. **Uncertainty: whether to store or derive.** |

#### `description` (text)

| Attribute | Value |
|-----------|-------|
| **Required?** | Low |
| **Reason** | Not shown in current frontend mock data, but useful for task detail views. |
| **Recommended type** | `text` |
| **Nullable?** | Yes |
| **Default?** | `null` |

### 7.3 Users Table

#### `job_title` (text)

| Attribute | Value |
|-----------|-------|
| **Required?** | Low |
| **Reason** | Frontend Settings page has a "Job Title" form field defaulting to "Project Manager". Team page shows roles but uses the `role` enum, not job titles. |
| **Recommended type** | `text` |
| **Nullable?** | Yes |
| **Default?** | `null` |

#### `avatar_url` (text)

| Attribute | Value |
|-----------|-------|
| **Required?** | Medium |
| **Reason** | Frontend Settings page has a "Change Avatar" button accepting JPG/PNG/GIF. Current schema only has `avatar_initials`. |
| **Recommended type** | `text` |
| **Nullable?** | Yes (initials serve as fallback) |
| **Default?** | `null` |

#### `last_active_at` (timestamptz)

| Attribute | Value |
|-----------|-------|
| **Required?** | Low |
| **Reason** | Frontend Team page shows "lastActive" as relative time ("2 hours ago", "2 days ago"). |
| **Recommended type** | `timestamptz` |
| **Nullable?** | Yes |
| **Default?** | `null` |
| **Note** | Should be updated via application logic on each request/session, not via DB trigger. |

#### `organization_id` (uuid FK)

| Attribute | Value |
|-----------|-------|
| **Required?** | Yes (critical) |
| **Reason** | Multi-tenancy. However, with the recommended membership table design, this column is **NOT needed** on the users table — organization membership is expressed through `organization_members`. |
| **Verdict** | **DO NOT ADD** — use `organization_members` table instead. |

### 7.4 AI Predictions Table

#### `approved_by` (uuid FK → users)

| Attribute | Value |
|-----------|-------|
| **Required?** | Yes |
| **Reason** | Frontend AI Recommendations page shows "Approved By" field on approved recommendations ("John Smith", "Sarah Chen"). |
| **Recommended type** | `uuid` FK → `users.id` |
| **Nullable?** | Yes (only set when status = 'approved') |
| **Default?** | `null` |
| **ON DELETE** | set null |

#### `approved_at` (timestamptz)

| Attribute | Value |
|-----------|-------|
| **Required?** | Yes |
| **Reason** | Frontend shows "Approved Date" on approved recommendations ("2025-07-15"). |
| **Recommended type** | `timestamptz` |
| **Nullable?** | Yes (only set when status = 'approved') |
| **Default?** | `null` |

#### `updated_at` (timestamptz)

| Attribute | Value |
|-----------|-------|
| **Required?** | Medium |
| **Reason** | Standard audit column. Needed to track when recommendation status changed. |
| **Recommended type** | `timestamptz` |
| **Nullable?** | No |
| **Default?** | `now()` |

### 7.5 Sprints Table

#### `velocity` (integer)

| Attribute | Value |
|-----------|-------|
| **Required?** | Low |
| **Reason** | Frontend Reports page shows `velocity: 32` in sprint report. However, velocity is the `completed_points` of the last completed sprint — fully derivable. |
| **Recommended type** | N/A |
| **Verdict** | **DO NOT ADD** — derive from last completed sprint query. |

### 7.6 Summary

| Column | Table | Required | Action |
|--------|-------|----------|--------|
| `description` | projects | High | **ADD** |
| `start_date` | projects | High | **ADD** |
| `budget_total` | projects | Medium | **ADD** (summary field) |
| `due_date` | tasks | High | **ADD** |
| `progress` | tasks | Medium | **DEFER** — evaluate derive vs store |
| `description` | tasks | Low | **DEFER** |
| `job_title` | users | Low | **ADD** |
| `avatar_url` | users | Medium | **ADD** |
| `last_active_at` | users | Low | **ADD** |
| `approved_by` | ai_predictions | Medium | **ADD** |
| `approved_at` | ai_predictions | Medium | **ADD** |
| `updated_at` | ai_predictions | Medium | **ADD** |
| `velocity` | sprints | Low | **REMOVE** — derivable |
| `organization_id` | users | High | **REMOVE** — use membership table |

---

## 8. AI Predictions Evaluation

### 8.1 Current Lifecycle

```
requirement submitted
  → AI analyzes requirement
  → ai_prediction created (status: 'pending')
  → PM reviews prediction
  → PM approves or rejects (status: 'approved' / 'rejected')
```

### 8.2 Assessment

**What works:**
- The pending → approved/rejected lifecycle is sufficient for the core flow.
- Confidence scoring with CHECK constraint (0–100).
- JSONB reasoning for flexible AI output.
- Links to both requirement and suggested sprint.

**What's missing:**

1. **Approval audit trail** — no record of WHO approved or WHEN. The frontend explicitly shows "Approved By: John Smith" and "Approved Date: 2025-07-15". Without `approved_by` and `approved_at`, this information is lost.

2. **No `updated_at`** — cannot track when the status last changed.

3. **No rejection reason** — when a PM rejects a recommendation, there's no way to record why. Consider adding a `rejection_reason` text column.

4. **No `project_id`** — querying predictions for a specific project requires a JOIN through requirements. Adding a denormalized `project_id` would simplify queries but introduce sync overhead. **Verdict: DO NOT ADD** — the JOIN is acceptable and avoids denormalization.

### 8.3 Should Approval Fields Belong Here?

**Yes.** The approval workflow is intrinsic to the AI prediction lifecycle. A separate `ai_prediction_approvals` table would be over-engineering for a simple approve/reject action. The `approved_by` and `approved_at` columns on `ai_predictions` are the correct location.

### 8.4 Should AI Predictions Reference Other Entities?

**Currently references:**
- `requirement_id` (NOT NULL) — correct.
- `suggested_sprint_id` (nullable) — correct.

**Should it also reference:**
- `project_id` — **NO** — derivable via requirement → project.
- `task_id` — **NO** — AI predictions are about requirements, not tasks.
- `user_id` (for the requester) — **NO** — the requirement's assignee serves this purpose.

**Verdict:** The current reference model is correct. Adding `approved_by` completes the picture.

---

## 9. Schema Anomalies

### 9.1 Users Self-Referential FK (CRITICAL)

```typescript
// Current (line 44-48):
foreignKey({
  columns: [table.id],
  foreignColumns: [table.id],  // ← references itself!
  name: "users_id_fkey"
}).onDelete("cascade")
```

This creates a circular self-reference: `users.id → users.id`. This is almost certainly a Drizzle artifact from attempting to model the `auth.users` foreign key. It should be **removed**.

The actual auth.users reference should be handled at the Supabase Auth level (the `users.id` is set to match `auth.users.id` during signup via a trigger or application logic).

### 9.2 Nullable display_id on requirements and tasks

Both `requirements.display_id` and `tasks.display_id` are nullable with a unique constraint. The frontend always displays these IDs (e.g., "REQ-001", "TASK-101"). They should be:
- Auto-generated by a database trigger or application logic on insert.
- Made NOT NULL after backfilling existing records.

### 9.3 Inconsistent Enum Usage

- `activity_logs.entity_type` is `text` — should be an enum.
- `activity_logs.action` is `text` — should be an enum.
- `notifications.type` is `text` — should be an enum.
- `invitations` has no `expires_at` — invitations should expire.

### 9.4 Missing indexes

- `requirements.display_id` — unique index exists (via unique constraint) ✅
- `tasks.display_id` — unique index exists ✅
- `sprints.project_id` — **MISSING index** (frequently queried by project).
- `backlog.project_id` — **MISSING index** (frequently queried by project).

---

## 10. Proposed Logical ER Structure

This is a **logical model** for reference — not a migration plan.

```
┌─────────────────────┐
│    organizations     │
├─────────────────────┤
│ id          UUID PK │
│ name        TEXT    │
│ slug        TEXT UQ │
│ industry    TEXT    │
│ timezone    TEXT    │
│ created_at  TIMESTAMPTZ │
│ updated_at  TIMESTAMPTZ │
└────────┬────────────┘
         │
         ├──┐
         │  │ organization_members
         │  ├──────────────────────┐
         │  │ org_id    FK → orgs  │
         │  │ user_id   FK → users │
         │  │ role      org_role   │
         │  │ created_at           │
         │  │ PK: (org_id,user_id) │
         │  └──────────────────────┘
         │
         ├── projects
         │   ├── id, name, code, client, description
         │   ├── manager_id → users
         │   ├── organization_id → organizations
         │   ├── method, status, priority, progress
         │   ├── start_date, end_date
         │   ├── budget_total (numeric)
         │   └── created_at, updated_at
         │
         ├── teams
         │   ├── id, name
         │   ├── organization_id → organizations
         │   ├── lead_id → users
         │   └── created_at
         │
         ├── invitations
         │   ├── id, email, role, status
         │   ├── organization_id → organizations
         │   ├── invited_by → users
         │   ├── expires_at
         │   └── created_at
         │
         └── documents (NEW)
             ├── id, name, type, size, version
             ├── project_id → projects
             ├── folder_id → folders (self-ref)
             ├── owner_id → users
             ├── organization_id → organizations
             ├── storage_path (Supabase Storage path)
             └── created_at, updated_at

┌─────────────────┐
│     users        │
├─────────────────┤
│ id          UUID PK → auth.users │
│ first_name  TEXT    │
│ last_name   TEXT    │
│ email       TEXT UQ │
│ department  TEXT    │
│ job_title   TEXT    │  ← NEW
│ avatar_url  TEXT    │  ← NEW
│ avatar_initials TEXT│
│ status      user_status │
│ last_active_at TIMESTAMPTZ │  ← NEW
│ created_at  TIMESTAMPTZ │
│ updated_at  TIMESTAMPTZ │
└─────────────────┘
  (role REMOVED from users — moved to organization_members)

┌───────────────────────────┐
│        sprints             │
├───────────────────────────┤
│ id UUID PK                │
│ project_id FK → projects  │
│ name, goal                │
│ status (sprint_status)    │
│ start_date, end_date      │
│ total_points, completed_points │
│ created_at, updated_at    │
└───────────────────────────┘

┌────────────────────────────┐
│       requirements          │
├────────────────────────────┤
│ id UUID PK                 │
│ display_id TEXT UQ NOT NULL│  ← Make NOT NULL
│ project_id FK → projects   │
│ title, description         │
│ category, business_value   │
│ priority, status           │
│ story_points               │
│ assignee_id FK → users     │
│ sprint_id FK → sprints     │
│ dependency_id FK → self    │
│ AI scoring fields...       │
│ created_at, updated_at     │
└────────────────────────────┘

┌──────────────────────────┐
│         tasks             │
├──────────────────────────┤
│ id UUID PK               │
│ display_id TEXT UQ NOT NULL │  ← Make NOT NULL
│ project_id FK → projects │
│ sprint_id FK → sprints   │
│ requirement_id FK → reqs │
│ title, description       │  ← description NEW
│ priority, points         │
│ column_status            │
│ assignee_id FK → users   │
│ due_date DATE            │  ← NEW
│ progress INTEGER         │  ← NEW (DEFER)
│ created_at, updated_at   │
└──────────────────────────┘

┌──────────────────────────┐
│     ai_predictions        │
├──────────────────────────┤
│ id UUID PK               │
│ requirement_id FK → reqs │
│ suggested_priority       │
│ suggested_sprint_id FK   │
│ confidence_score         │
│ summary, reasoning       │
│ recommendation_status    │
│ approved_by FK → users   │  ← NEW
│ approved_at TIMESTAMPTZ  │  ← NEW
│ created_at               │
│ updated_at TIMESTAMPTZ   │  ← NEW
└──────────────────────────┘

┌──────────────────┐  ┌──────────────────┐
│  activity_logs    │  │  notifications    │
│  (add org_id)    │  │  (no changes)     │
└──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐
│  backlog          │  │  team_members     │
│  (make proj NOT NULL) │ │ (no changes)  │
└──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐
│  invitations      │  │ project_members   │
│  (add org_id,    │  │ (add role col)    │
│   expires_at)    │  │                   │
└──────────────────┘  └──────────────────┘
```

### New Tables (Governance — Deferred)

```
budgets            → project_id, category, allocated, spent, status
contracts          → project_id, name, vendor, value, status, expiry
approvals          → project_id, title, requester_id, type, status, requested_date
risks              → project_id, title, probability, impact, owner_id, mitigation
change_requests    → project_id, title, type, impact, status, requester_id, date
milestones         → project_id, name, date, status
calendar_events    → project_id, title, date, time, type
user_preferences   → user_id, theme, notification_settings (jsonb)
```

---

## 11. Change Classification

### Critical (Must Fix for Multi-Tenancy)

| Change | Table | Classification | Notes |
|--------|-------|---------------|-------|
| Create `organizations` table | NEW | **MODIFY** (new table) | Foundation for multi-tenancy |
| Create `organization_members` table | NEW | **MODIFY** (new table) | Org membership with roles |
| Remove `users.role` column | users | **MODIFY** | Move to organization_members |
| Remove `users` self-referential FK | users | **MODIFY** | Fix Drizzle artifact |
| Add `organization_id` to projects | projects | **MODIFY** | Tenant isolation |
| Add `organization_id` to teams | teams | **MODIFY** | Tenant isolation |
| Add `organization_id` to invitations | invitations | **MODIFY** | Tenant isolation |
| Add `organization_id` to activity_logs | activity_logs | **MODIFY** | Cross-project tenant queries |

### High Priority (Frontend-Breaking Gaps)

| Change | Table | Classification | Notes |
|--------|-------|---------------|-------|
| Add `description` column | projects | **MODIFY** | Frontend displays it |
| Add `start_date` column | projects | **MODIFY** | Frontend requires it |
| Add `due_date` column | tasks | **MODIFY** | Frontend displays it |
| Make `display_id` NOT NULL | requirements, tasks | **MODIFY** | Frontend always shows it |
| Add `approved_by` column | ai_predictions | **MODIFY** | Frontend shows it |
| Add `approved_at` column | ai_predictions | **MODIFY** | Frontend shows it |
| Add `updated_at` column | ai_predictions | **MODIFY** | Standard audit |

### Medium Priority (Functional Gaps)

| Change | Table | Classification | Notes |
|--------|-------|---------------|-------|
| Add `budget_total` column | projects | **MODIFY** | Summary budget field |
| Add `role` column | project_members | **MODIFY** | Per-project roles |
| Add `avatar_url` column | users | **MODIFY** | Avatar uploads |
| Add `expires_at` column | invitations | **MODIFY** | Invitation expiry |
| Create `documents` table | NEW | **MODIFY** (new table) | Document management |
| Create `folders` table | NEW | **MODIFY** (new table) | Folder hierarchy |
| Add index on `sprints.project_id` | sprints | **MODIFY** | Query performance |
| Add index on `backlog.project_id` | backlog | **MODIFY** | Query performance |

### Low Priority (Nice-to-Have)

| Change | Table | Classification | Notes |
|--------|-------|---------------|-------|
| Add `job_title` column | users | **MODIFY** | Profile enrichment |
| Add `last_active_at` column | users | **MODIFY** | Activity tracking |
| Add `progress` column | tasks | **DEFER** | Evaluate derive vs store |
| Add `description` column | tasks | **DEFER** | Not in current frontend mock |
| Convert `entity_type` to enum | activity_logs | **MODIFY** | Type safety |
| Convert `action` to enum | activity_logs | **MODIFY** | Type safety |
| Convert `type` to enum | notifications | **MODIFY** | Type safety |

### Remove

| Change | Table | Classification | Notes |
|--------|-------|---------------|-------|
| Self-referential FK on users.id | users | **REMOVE** | Drizzle artifact |
| `velocity` column on sprints | sprints | **REMOVE** | Fully derivable |
| `organization_id` on users | users | **REMOVE** | Use membership table |

### Defer (Governance/External Features)

| Change | Table | Classification | Notes |
|--------|-------|---------------|-------|
| Create `budgets` table | NEW | **DEFER** | Governance page |
| Create `contracts` table | NEW | **DEFER** | Governance page |
| Create `approvals` table | NEW | **DEFER** | Governance page |
| Create `risks` table | NEW | **DEFER** | Governance page |
| Create `change_requests` table | NEW | **DEFER** | Governance page |
| Create `milestones` table | NEW | **DEFER** | Monitoring page |
| Create `calendar_events` table | NEW | **DEFER** | Calendar page |
| Create `user_preferences` table | NEW | **DEFER** | Settings page |

---

## Appendix A: Enum Additions Recommended

| Enum Name | Values | Purpose |
|-----------|--------|---------|
| `org_role` | OWNER, ADMIN, MEMBER | Organization membership roles |
| `project_role` | MANAGER, DEVELOPER, VIEWER | Project membership roles |
| `activity_action` | created, updated, deleted, approved, rejected, completed, assigned, commented | Typed activity actions |
| `entity_type_enum` | project, requirement, task, sprint, team, document, budget, approval, risk, change_request | Typed entity references |
| `notification_type` | task, sprint, approval, document, budget, system | Typed notification categories |
| `budget_status` | ontrack, overbudget, at_risk | Budget health |
| `contract_status` | active, pending, expired, terminated | Contract lifecycle |
| `approval_type` | scope, budget, vendor, resource | Approval categories |
| `approval_status` | pending, approved, rejected | Approval lifecycle |
| `risk_level` | high, medium, low | Probability/impact |
| `change_request_type` | feature, technical, process | Change categories |
| `milestone_status` | completed, current, upcoming | Milestone states |
| `calendar_event_type` | sprint, meeting, milestone, deadline, document | Event categories |

---

## Appendix B: Uncertainty Register

| ID | Topic | Uncertainty | Impact | Recommendation |
|----|-------|-------------|--------|----------------|
| U1 | Viewer role | Frontend shows "Viewer" role but enum only has 3 values | Medium | Add VIEWER to project_role enum |
| U2 | Task progress | Whether to store or derive from column_status | Low | Defer — evaluate during implementation |
| U3 | Budget model | Single `budget_total` on projects vs separate `budgets` table | Medium | Add both: total for quick access, budgets table for categories |
| U4 | Per-project roles | Whether `project_members.role` is needed or global role suffices | High | Add per-project roles — global role is insufficient for multi-tenant SaaS |
| U5 | Activity log enums | Whether to convert text fields to enums now or later | Low | Convert now — prevents data quality issues |
| U6 | Governance tables priority | Whether governance tables (budget, contracts, approvals, risks, change_requests) should be built with core or deferred | Medium | Defer — they are self-contained and don't block core functionality |
| U7 | Documents storage | Whether to use Supabase Storage with metadata table or external storage | Low | Supabase Storage with metadata table is the natural choice |
