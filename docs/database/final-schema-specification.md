# Final Schema Specification — SmartSprint AI

Authoritative database specification reconciled from all prior audits. This document supersedes all previous audit recommendations where conflicts exist.

Generated: 2026-09-02

---

## Table of Contents

1. [Design Principles & Conflict Resolution](#1-design-principles--conflict-resolution)
2. [Identity & Tenancy](#2-identity--tenancy)
3. [Project Management](#3-project-management)
4. [Development](#4-development)
5. [Governance](#5-governance)
6. [Documents](#6-documents)
7. [User & Application](#7-user--application)
8. [Derived Values — Do NOT Persist](#8-derived-values--do-not-persist)
9. [Deferred Entities](#9-deferred-entities)
10. [Enum Reference](#10-enum-reference)
11. [Complete ER Diagram](#11-complete-er-diagram)
12. [Uncertainty Register](#12-uncertainty-register)

---

## 1. Design Principles & Conflict Resolution

### 1.1 Design Principles

1. **Single source of truth** — `supabase/schema.ts` remains the DDL source of truth. This document specifies what it should contain.
2. **Three roles only** — ADMIN, PROJECT_MANAGER, DEVELOPER. Evaluated in the context of organization membership. No VIEWER, MEMBER, MANAGER, or OWNER roles.
3. **Organization-scoped tenancy** — All business data scoped to an organization via `organization_id` or reachable through a FK chain.
4. **Normalize, then denormalize only for performance** — Favor relational integrity. Denormalize only when query patterns justify it.
5. **Derive, don't store** — Metrics computed from other columns (progress, velocity, variance) belong in SQL views or API layer, not persisted columns.

### 1.2 Conflicts Resolved

| Conflict | Resolution | Rationale |
|----------|-----------|-----------|
| `users.role` vs `organization_members.role` | `organization_members.role` is the authoritative authorization source. `users.role` is **removed** from the schema. Authorization checks always query `organization_members`. | A global role on `users` cannot represent org-scoped permissions. The core audit's suggestion to keep it as a "legacy pointer" adds confusion with no benefit. Clean break. |
| Core audit: add `project_members.role` vs Auth audit: don't add project-level roles | **Do NOT add `project_members.role`.** Roles are org-scoped only. Project access is governed by membership (`project_members` join table) + org role. | The task explicitly restricts to three roles. Adding per-project roles would either introduce new role values (violating the constraint) or create a confusing dual-authority model. |
| Documents: semantic versioning (v1.2) vs integer versioning (v1, v2) | **Integer versioning.** Store `version: integer`. Display as "v1", "v2". Frontend adapts. | Semantic versioning adds schema complexity for a display difference. The documents-storage audit's uncertainty is resolved in favor of simplicity. |
| Calendar events: hybrid (derivable + stored) vs fully deferred | **Deferred entirely.** Calendar page initially derives all events from `sprints` and `milestones`. A `calendar_events` table for user-created events (meetings) is deferred. | The governance audit's recommendation is correct: 2 of 5 event types are derivable, and the remaining types are low-priority. Simpler to defer than to build a partial hybrid. |
| Budget: single `budgets` table vs `budget_line_items` + `projects.budget_total` | **Two-layer design.** `projects.budget_total` + `projects.budget_currency` for summary. `budget_line_items` for category breakdown. | The governance audit's analysis is correct. The UI shows both a project-level summary and a per-category table. These are distinct data needs. |
| `risk_level` enum vs reusing `priority_level` | **Create a separate `risk_level` enum.** Same values (high/medium/low) but distinct semantic. | The governance audit's rationale is sound: future divergence risk and semantic clarity outweigh enum proliferation. |
| Approvals: polymorphic target vs no reference | **Include polymorphic `target_type`/`target_id`.** Nullable. | Enables future drill-down without schema changes. The governance audit's recommendation is correct. |

---

## 2. Identity & Tenancy

### 2.1 `organizations`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Tenant root. Every piece of business data belongs to an organization. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `name` | text | NO | — | Display name, e.g. "Acme Corporation" |
| `slug` | text | NO | — | URL-friendly identifier, unique |
| `industry` | text | YES | — | Frontend Settings page |
| `timezone` | text | YES | — | Frontend Settings page |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Indexes:** Unique index on `slug`.
**Cardinality:** 1 organization → many users (via `organization_members`), many projects, many teams.
**Delete behavior:** Organizations are never deleted via cascading FK. Soft-delete or admin-only hard-delete with confirmation.

### 2.2 `users`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Application user profile. Linked to Supabase Auth via `id`. |
| **Primary Key** | `id` (uuid, NOT NULL) — must equal `auth.users.id` |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | — | PK. References `auth.users.id` (enforced by signup trigger, NOT a FK constraint in schema.ts). **Self-referential FK is REMOVED.** |
| `first_name` | text | NO | — | |
| `last_name` | text | NO | — | |
| `email` | text | NO | — | Unique |
| `department` | text | YES | — | |
| `job_title` | text | YES | — | **NEW.** Frontend Settings page. |
| `status` | user_status | NO | 'active' | Enum: active, inactive |
| `avatar_initials` | text | YES | — | Derived from name. Fallback when no avatar. |
| `avatar_url` | text | YES | — | **NEW.** Supabase Storage public URL. |
| `last_active_at` | timestamptz | YES | — | **NEW.** Updated by application logic on activity. |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**REMOVED from current schema:**
- `role` column — moved to `organization_members.role`. Authorization never reads `users.role`.
- Self-referential FK on `id` (Drizzle artifact) — removed.

**Indexes:** Unique index on `email`.
**Cardinality:** 1 user → many `organization_members` rows, many `project_members` rows, many `team_members` rows, many tasks/requirements assigned.
**Delete behavior:** ON DELETE CASCADE from `auth.users` (via trigger or RLS). Application handles cleanup of `organization_members`, `notifications`, etc.

**⚠ UNCERTAINTY:** Whether `last_active_at` should be updated on every API request (expensive) or only on significant actions (login, task update). Recommendation: update on login and on actions that produce activity_logs entries. Not on every read.

### 2.3 `organization_members`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Many-to-many join between organizations and users. Carries the org-scoped role. This is the **authoritative source for authorization**. |
| **Primary Key** | Composite: (`organization_id`, `user_id`) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `organization_id` | uuid | NO | — | FK → organizations.id, ON DELETE CASCADE |
| `user_id` | uuid | NO | — | FK → users.id, ON DELETE CASCADE |
| `role` | user_role | NO | 'DEVELOPER' | **Uses existing `user_role` enum.** Values: ADMIN, PROJECT_MANAGER, DEVELOPER. |
| `created_at` | timestamptz | NO | now() | When membership was established |

**Indexes:**
- Composite PK provides primary lookup.
- Index on `user_id` for "find all orgs for a user" queries.

**Cardinality:** A user can belong to multiple organizations. An organization has many members. Each membership has exactly one role.
**Delete behavior:** ON DELETE CASCADE from both sides. Removing a user removes their memberships. Removing an org removes all memberships.

### 2.4 `invitations`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Pending user invitations to join an organization. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organization_id` | uuid | NO | — | **NEW.** FK → organizations.id, ON DELETE CASCADE. Scoped to target org. |
| `email` | text | NO | — | Invitee email |
| `role` | user_role | NO | — | Role to assign upon acceptance |
| `status` | invitation_status | NO | 'pending' | Enum: pending, expired, accepted, rejected |
| `invited_by` | uuid | YES | — | FK → users.id, ON DELETE SET NULL |
| `expires_at` | timestamptz | YES | — | **NEW.** Invitation expiration. |
| `created_at` | timestamptz | NO | now() | |

**Indexes:** Index on `organization_id` and `email`.
**Delete behavior:** ON DELETE CASCADE from organization.
**Cardinality:** 1 organization → many invitations.

---

## 3. Project Management

### 3.1 `projects`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Core project entity. Tenant-scoped via organization. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organization_id` | uuid | NO | — | **NEW.** FK → organizations.id, ON DELETE CASCADE. Tenant scope. |
| `name` | text | NO | — | |
| `code` | text | YES | — | Unique. Human-readable project code, e.g. "PRJ-001" |
| `description` | text | YES | — | **NEW.** Frontend Project Detail + Create Project form. |
| `client` | text | YES | — | Client name |
| `manager_id` | uuid | YES | — | FK → users.id, ON DELETE SET NULL |
| `method` | project_method | NO | 'scrum' | |
| `status` | project_status | NO | 'pending' | |
| `priority` | priority_level | NO | 'medium' | |
| `progress` | integer | NO | 0 | CHECK (progress >= 0 AND progress <= 100) |
| `start_date` | date | YES | — | **NEW.** Frontend Create Project + Project Detail. |
| `end_date` | date | YES | — | |
| `budget_total` | numeric(12,2) | YES | — | **NEW.** Approved total budget. Summary for quick access. |
| `budget_currency` | text | YES | 'USD' | **NEW.** ISO 4217 currency code. |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Indexes:**
- `idx_projects_organization_id` on `organization_id` — **NEW.** Tenant isolation queries.
- `idx_projects_manager_id` on `manager_id` — EXISTING.
- Unique constraint on `code`.

**Cardinality:** 1 organization → many projects. 1 project → many sprints, requirements, tasks, members, documents, governance records.
**Delete behavior:** ON DELETE CASCADE from organization.

### 3.2 `teams`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Named groups of users within an organization. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organization_id` | uuid | NO | — | **NEW.** FK → organizations.id, ON DELETE CASCADE |
| `name` | text | NO | — | |
| `lead_id` | uuid | YES | — | FK → users.id, ON DELETE SET NULL |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | **NEW.** Standard audit column. |

**Indexes:** Index on `organization_id`.
**Cardinality:** 1 organization → many teams. 1 team → many members (via `team_members`).
**Delete behavior:** ON DELETE CASCADE from organization.

### 3.3 `team_members`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Many-to-many join between teams and users. Membership only — no role column. |
| **Primary Key** | Composite: (`team_id`, `user_id`) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `team_id` | uuid | NO | — | FK → teams.id, ON DELETE CASCADE |
| `user_id` | uuid | NO | — | FK → users.id, ON DELETE CASCADE |

**Cardinality:** Many-to-many. A user can be on multiple teams.
**Delete behavior:** CASCADE from both sides.

### 3.4 `project_members`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Many-to-many join between projects and users. Membership only — no role column. |
| **Primary Key** | Composite: (`project_id`, `user_id`) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `project_id` | uuid | NO | — | FK → projects.id, ON DELETE CASCADE |
| `user_id` | uuid | NO | — | FK → users.id, ON DELETE CASCADE |

**Note:** No `role` column. Authorization within a project is derived from `organization_members.role`. A PROJECT_MANAGER in the org can manage all projects. A DEVELOPER in the org has read access to projects they are members of.
**Cardinality:** Many-to-many.
**Delete behavior:** CASCADE from both sides.

---

## 4. Development

### 4.1 `requirements`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Project requirements with AI-scoring metadata. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `display_id` | text | NO | — | **Changed from nullable to NOT NULL.** Auto-generated, e.g. "REQ-001". Unique. |
| `project_id` | uuid | NO | — | FK → projects.id, ON DELETE CASCADE |
| `title` | text | NO | — | |
| `description` | text | YES | — | |
| `category` | requirement_category | NO | — | |
| `business_value` | priority_level | NO | 'medium' | Reuses priority_level enum |
| `customer_importance` | integer | YES | — | AI scoring field |
| `urgency` | integer | YES | — | AI scoring field |
| `complexity` | integer | YES | — | AI scoring field |
| `estimated_effort` | integer | YES | — | |
| `risk` | integer | YES | — | |
| `story_points` | integer | YES | — | |
| `dependency_id` | uuid | YES | — | Self-ref FK → requirements.id, ON DELETE SET NULL |
| `priority` | priority_level | NO | 'medium' | |
| `status` | requirement_status | NO | 'draft' | |
| `assignee_id` | uuid | YES | — | FK → users.id, ON DELETE SET NULL |
| `sprint_id` | uuid | YES | — | FK → sprints.id, ON DELETE SET NULL |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Indexes:** EXISTING indexes on `assignee_id`, `project_id`, `sprint_id`. Unique on `display_id`.
**Cardinality:** 1 project → many requirements. 1 requirement → 0..1 sprint, 0..1 assignee, 0..1 dependency, many tasks, many AI predictions.
**Delete behavior:** ON DELETE CASCADE from project. SET NULL on assignee, sprint, dependency.

### 4.2 `sprints`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Time-boxed iteration within a project. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `project_id` | uuid | NO | — | FK → projects.id, ON DELETE CASCADE |
| `name` | text | NO | — | |
| `goal` | text | YES | — | |
| `status` | sprint_status | NO | 'planning' | |
| `start_date` | date | YES | — | |
| `end_date` | date | YES | — | |
| `total_points` | integer | YES | — | **Should default to 0** in practice, nullable in schema for backward compat. |
| `completed_points` | integer | YES | — | **Should default to 0** in practice, nullable in schema for backward compat. |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Indexes:** **NEW** — `idx_sprints_project_id` on `project_id`. Missing from current schema and frequently queried.
**Cardinality:** 1 project → many sprints. 1 sprint → many tasks, many requirements (via sprint_id).
**Delete behavior:** ON DELETE CASCADE from project.

**Note:** `velocity` is NOT stored. Derived by querying `completed_points` of the last completed sprint for this project.

### 4.3 `tasks`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Work items within sprints. Kanban-tracked. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `display_id` | text | NO | — | **Changed from nullable to NOT NULL.** Auto-generated, e.g. "TASK-101". Unique. |
| `sprint_id` | uuid | YES | — | FK → sprints.id, ON DELETE SET NULL. Nullable for backlog tasks. |
| `requirement_id` | uuid | YES | — | FK → requirements.id, ON DELETE SET NULL |
| `project_id` | uuid | NO | — | FK → projects.id, ON DELETE CASCADE |
| `title` | text | NO | — | |
| `description` | text | YES | — | **NEW.** Useful for task detail views. |
| `priority` | priority_level | NO | 'medium' | |
| `points` | integer | YES | — | Story points for this task |
| `assignee_id` | uuid | YES | — | FK → users.id, ON DELETE SET NULL |
| `column_status` | task_column_status | NO | 'backlog' | Kanban column |
| `due_date` | date | YES | — | **NEW.** Frontend Execution page. |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Indexes:** EXISTING indexes on `assignee_id`, `project_id`, `sprint_id`. Unique on `display_id`.
**Cardinality:** 1 sprint → many tasks. 1 requirement → many tasks. 1 project → many tasks. 1 task → 0..1 assignee.
**Delete behavior:** ON DELETE CASCADE from project. SET NULL from sprint, requirement, assignee.

**Note:** `progress` is NOT stored. Derived from `column_status` mapping (backlog=0%, todo=10%, inProgress=50%, review=75%, testing=90%, done=100%) or calculated from subtask completion if subtasks are ever added.

### 4.4 `backlog`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Rank-ordered product backlog linking to requirements. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `project_id` | uuid | NO | — | **Changed from nullable to NOT NULL.** FK → projects.id, ON DELETE CASCADE |
| `requirement_id` | uuid | NO | — | FK → requirements.id, ON DELETE CASCADE. Unique constraint. |
| `rank` | integer | NO | — | Ordering position |
| `created_at` | timestamptz | NO | now() | |

**Indexes:** **NEW** — `idx_backlog_project_id` on `project_id`. Unique on `requirement_id` (EXISTS).
**Cardinality:** 1 project → many backlog entries. 1 backlog entry → 1 requirement (1:1 via unique constraint).
**Delete behavior:** ON DELETE CASCADE from both project and requirement.

---

## 5. Governance

All governance tables are project-scoped. Each has `project_id` FK → `projects.id` with ON DELETE CASCADE.

### 5.1 `budget_line_items`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Per-category budget tracking. Combined with `projects.budget_total` for project-level summary. |
| **Primary Key** | `id` | (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `project_id` | uuid | NO | — | FK → projects.id, ON DELETE CASCADE |
| `category` | text | NO | — | e.g. "Development", "Design", "Testing", "Infrastructure" |
| `allocated` | numeric(12,2) | NO | — | Allocated budget amount |
| `spent` | numeric(12,2) | NO | 0 | Amount spent so far |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Indexes:** `idx_budget_line_items_project_id` on `project_id`.
**Unique constraint:** `(project_id, category)` — one line item per category per project.
**Cardinality:** 1 project → many budget line items.
**Delete behavior:** ON DELETE CASCADE from project.

**Derived values (NOT stored):**
- `remaining` = `allocated - spent`
- `status` = derived from spent/allocated ratio (ontrack if <90%, at_risk if 90-100%, overbudget if >100%)
- `variance` = `((spent / allocated) - 1) * 100`

### 5.2 `contracts`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Vendor/contract management for a project. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `project_id` | uuid | NO | — | FK → projects.id, ON DELETE CASCADE |
| `name` | text | NO | — | Contract name |
| `vendor` | text | NO | — | Vendor/party name |
| `value` | numeric(12,2) | NO | — | Contract value |
| `status` | contract_status | NO | 'pending' | Enum: active, pending, expired, terminated |
| `expiry` | date | YES | — | Expiration date |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Indexes:** `idx_contracts_project_id` on `project_id`.
**Cardinality:** 1 project → many contracts.
**Delete behavior:** ON DELETE CASCADE from project.

### 5.3 `approvals`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Governance approval workflow. Separate from AI recommendation approvals (which live on `ai_predictions.recommendation_status`). |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `project_id` | uuid | NO | — | FK → projects.id, ON DELETE CASCADE |
| `title` | text | NO | — | What is being approved |
| `requester_id` | uuid | YES | — | FK → users.id, ON DELETE SET NULL |
| `type` | approval_type | NO | — | Enum: scope, budget, vendor, resource |
| `status` | approval_status | NO | 'pending' | Enum: pending, approved, rejected |
| `target_type` | text | YES | — | Polymorphic entity type reference (e.g. "requirement", "contract") |
| `target_id` | uuid | YES | — | Polymorphic entity ID reference |
| `notes` | text | YES | — | Comments/justification |
| `requested_at` | timestamptz | NO | now() | When approval was requested |
| `decided_at` | timestamptz | YES | — | When approved/rejected |
| `decided_by` | uuid | YES | — | FK → users.id, ON DELETE SET NULL. Who decided. |
| `created_at` | timestamptz | NO | now() | |

**Indexes:** `idx_approvals_project_id` on `project_id`, `idx_approvals_status` on `status`.
**Cardinality:** 1 project → many approvals. Polymorphic reference targets any entity.
**Delete behavior:** ON DELETE CASCADE from project. SET NULL from users.

**⚠ UNCERTAINTY:** Whether `target_type`/`target_id` should be text+uuid (as specified) or a dedicated enum for `target_type`. Using text provides flexibility but loses type safety. Recommendation: text for now, consider enum if the set of target types stabilizes.

### 5.4 `risks`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Project risk register. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `project_id` | uuid | NO | — | FK → projects.id, ON DELETE CASCADE |
| `title` | text | NO | — | Risk description |
| `probability` | risk_level | NO | — | Enum: high, medium, low |
| `impact` | risk_level | NO | — | Enum: high, medium, low |
| `owner_id` | uuid | YES | — | FK → users.id, ON DELETE SET NULL |
| `mitigation` | text | YES | — | Mitigation strategy |
| `status` | risk_status | NO | 'open' | Enum: open, mitigated, closed |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Indexes:** `idx_risks_project_id` on `project_id`.
**Cardinality:** 1 project → many risks. 1 risk → 0..1 owner.
**Delete behavior:** ON DELETE CASCADE from project. SET NULL from owner.

**Derived values (NOT stored):**
- `severity` = derived from probability × impact at query time:
  - high/high → critical
  - high/medium or medium/high → high
  - high/low, medium/medium, low/high → medium
  - medium/low, low/medium → low
  - low/low → minimal

### 5.5 `change_requests`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Scope/technical change tracking with own display ID format ("CR-001"). |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `display_id` | text | YES | — | Unique. Auto-generated "CR-{seq}". Nullable for existing data compatibility. |
| `project_id` | uuid | NO | — | FK → projects.id, ON DELETE CASCADE |
| `title` | text | NO | — | Change request title |
| `description` | text | YES | — | Detailed description |
| `type` | change_request_type | NO | — | Enum: feature, technical, process |
| `impact` | priority_level | NO | — | Reuses existing priority_level enum |
| `status` | change_request_status | NO | 'pending' | Enum: pending, approved, rejected |
| `requester_id` | uuid | YES | — | FK → users.id, ON DELETE SET NULL |
| `requester_name` | text | YES | — | Denormalized display name (mock shows team names like "Product Team") |
| `requested_at` | timestamptz | NO | now() | |
| `decided_at` | timestamptz | YES | — | |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Indexes:** `idx_change_requests_project_id` on `project_id`, `idx_change_requests_display_id` on `display_id`.
**Cardinality:** 1 project → many change requests.
**Delete behavior:** ON DELETE CASCADE from project.

### 5.6 `milestones`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Project milestone tracking. Appears on Monitoring timeline and Create Project form. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `project_id` | uuid | NO | — | FK → projects.id, ON DELETE CASCADE |
| `name` | text | NO | — | Milestone name |
| `target_date` | date | NO | — | Planned date |
| `completed` | boolean | NO | false | Whether milestone has been achieved |
| `completed_at` | timestamptz | YES | — | When achieved |
| `sort_order` | integer | NO | 0 | Ordering within project |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Indexes:** `idx_milestones_project_id` on `project_id`.
**Cardinality:** 1 project → many milestones.
**Delete behavior:** ON DELETE CASCADE from project.

**Derived values (NOT stored):**
- `status` display = derived from `completed` + `target_date`:
  - `completed = true` → "completed"
  - `completed = false AND target_date <= CURRENT_DATE` → "current" (or "overdue")
  - `completed = false AND target_date > CURRENT_DATE` → "upcoming"

**Note:** The SDLC timeline on the Project Detail page (Initiation → Requirements → Design → etc.) is NOT milestones. It is a derived view from project status and sprint progress. Do not create a table for it.

---

## 6. Documents

### 6.1 `folders`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Folder hierarchy for project documents. Supports nesting for future hierarchy. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `project_id` | uuid | NO | — | FK → projects.id, ON DELETE CASCADE. **Project-scoped.** |
| `parent_id` | uuid | YES | — | Self-ref FK → folders.id, ON DELETE CASCADE. NULL = root folder. |
| `name` | text | NO | — | Folder name |
| `created_by` | uuid | NO | — | FK → users.id, ON DELETE RESTRICT |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Indexes:** `idx_folders_project_id` on `project_id`, `idx_folders_parent_id` on `parent_id`.
**Unique constraint:** `(project_id, parent_id, name)` — prevent duplicate names within same parent.
**Cardinality:** 1 project → many folders. Folders can nest via `parent_id`. 1 folder → many documents.
**Delete behavior:** ON DELETE CASCADE from project and parent folder.

**⚠ UNCERTAINTY:** Whether the documents page operates within a project context or is organization-wide. The frontend mock shows a flat folder list without a project selector. Recommendation: project-scoped, with the API filtering by the current project context. If a global document center is needed later, `project_id` can be made nullable.

**Derived values (NOT stored):**
- `document_count` = `COUNT(documents WHERE folder_id = X)`

### 6.2 `documents`

| Attribute | Value |
|-----------|-------|
| **Purpose** | File metadata for project documents. Binary content stored in Supabase Storage. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `project_id` | uuid | NO | — | FK → projects.id, ON DELETE CASCADE |
| `folder_id` | uuid | YES | — | FK → folders.id, ON DELETE SET NULL. NULL = root/unfiled. |
| `name` | text | NO | — | Original filename |
| `file_type` | document_type | NO | — | Enum: pdf, doc, image, code, spreadsheet, other. Derived from extension at upload. |
| `file_size` | bigint | NO | — | Size in bytes |
| `storage_path` | text | NO | — | Supabase Storage object path |
| `storage_bucket` | text | NO | 'project-documents' | Bucket name |
| `owner_id` | uuid | NO | — | FK → users.id, ON DELETE RESTRICT |
| `version` | integer | NO | 1 | Sequential version number |
| `parent_version_id` | uuid | YES | — | Self-ref FK → documents.id, ON DELETE SET NULL. Links to previous version. |
| `is_latest` | boolean | NO | true | Quick filter for current version |
| `description` | text | YES | — | Optional notes |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Indexes:**
- `idx_documents_project_id` on `project_id`
- `idx_documents_folder_id` on `folder_id`
- `idx_documents_owner_id` on `owner_id`
- `idx_documents_project_folder` on `(project_id, folder_id)` — composite for primary query pattern

**Cardinality:** 1 project → many documents. 1 folder → many documents. 1 user → many owned documents. Document versions form a linked list via `parent_version_id`.
**Delete behavior:** ON DELETE CASCADE from project. SET NULL from folder. RESTRICT from owner (prevent deleting a user who owns documents).

**Versioning approach:** Simple integer versioning. When a new version is uploaded:
1. Set the old document's `is_latest = false`
2. Insert a new row with `version = old.version + 1`, `parent_version_id = old.id`, `is_latest = true`
3. Frontend displays "v1", "v2", etc. (not "v1.2")

### 6.3 Supabase Storage Buckets

| Bucket | Access | Path Convention | Purpose |
|--------|--------|----------------|---------|
| `project-documents` | Private (org-member RLS) | `{project_id}/{folder_id}/{document_id}/{filename}` | Project document binary content |
| `avatars` | Public | `{user_id}/avatar.{ext}` | User avatar images |

**Storage RLS:** Project documents bucket requires org membership check. Avatars bucket is public for display.

---

## 7. User & Application

### 7.1 `notifications`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Per-user notification inbox. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `user_id` | uuid | NO | — | FK → users.id, ON DELETE CASCADE |
| `type` | notification_type | NO | — | **Changed from text to enum.** Enum: task, sprint, approval, document, budget, system |
| `title` | text | NO | — | |
| `description` | text | YES | — | |
| `priority` | priority_level | NO | 'medium' | |
| `read` | boolean | NO | false | |
| `action_label` | text | YES | — | CTA button text |
| `created_at` | timestamptz | NO | now() | |

**Indexes:** EXISTING index on `user_id`.
**Cardinality:** 1 user → many notifications.
**Delete behavior:** ON DELETE CASCADE from user.

### 7.2 `activity_logs`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Audit trail of actions across the system. Polymorphic entity reference. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organization_id` | uuid | YES | — | **NEW.** FK → organizations.id, ON DELETE SET NULL. For cross-project tenant queries. |
| `project_id` | uuid | YES | — | FK → projects.id, ON DELETE SET NULL |
| `user_id` | uuid | YES | — | FK → users.id, ON DELETE SET NULL |
| `action` | activity_action | NO | — | **Changed from text to enum.** Enum: created, updated, deleted, approved, rejected, completed, assigned, commented |
| `value` | text | YES | — | Descriptive value |
| `entity_type` | entity_type_enum | YES | — | **Changed from text to enum.** Enum: project, requirement, task, sprint, team, document, budget, approval, risk, change_request |
| `entity_id` | uuid | YES | — | Polymorphic reference |
| `created_at` | timestamptz | NO | now() | |

**Indexes:** EXISTING index on `project_id`. **NEW** — index on `organization_id`.
**Cardinality:** 1 project → many activity logs. 1 user → many activity logs.
**Delete behavior:** SET NULL from project and user (preserve audit trail).

### 7.3 `ai_predictions`

| Attribute | Value |
|-----------|-------|
| **Purpose** | AI-generated prioritization and scheduling recommendations for requirements. |
| **Primary Key** | `id` (uuid, default gen_random_uuid(), NOT NULL) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `requirement_id` | uuid | NO | — | FK → requirements.id, ON DELETE CASCADE |
| `suggested_priority` | priority_level | YES | — | |
| `suggested_sprint_id` | uuid | YES | — | FK → sprints.id, ON DELETE SET NULL |
| `confidence_score` | numeric(5,2) | YES | — | CHECK (0–100) |
| `summary` | text | YES | — | |
| `reasoning` | jsonb | YES | — | Array of reasoning strings |
| `recommendation_status` | recommendation_status | NO | 'pending' | |
| `approved_by` | uuid | YES | — | **NEW.** FK → users.id, ON DELETE SET NULL. |
| `approved_at` | timestamptz | YES | — | **NEW.** When approved/rejected. |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | **NEW.** Standard audit column. |

**Indexes:** No existing indexes beyond FK defaults. Consider adding index on `recommendation_status` for filtered queries.
**Cardinality:** 1 requirement → many AI predictions. 1 sprint → many suggested assignments.
**Delete behavior:** ON DELETE CASCADE from requirement. SET NULL from sprint and approver.

**Note:** This is SEPARATE from the `approvals` governance table. AI recommendation approvals update `ai_predictions.recommendation_status` directly. They do NOT create records in the `approvals` table.

### 7.4 `user_preferences`

| Attribute | Value |
|-----------|-------|
| **Purpose** | User UI preferences and notification settings. One row per user. |
| **Primary Key** | `user_id` (uuid, FK → users.id, ON DELETE CASCADE) |

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `user_id` | uuid | NO | — | PK, FK → users.id, ON DELETE CASCADE |
| `theme` | text | NO | 'light' | 'light', 'dark', 'system' |
| `sidebar_collapsed` | boolean | NO | false | |
| `notification_preferences` | jsonb | NO | '{}' | Structured notification toggles (see schema below) |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Notification preferences JSONB schema:**
```json
{
  "task_assignments": { "email": true, "push": true },
  "sprint_updates": { "email": true, "push": false },
  "document_uploads": { "email": false, "push": true },
  "approval_requests": { "email": true, "push": true },
  "budget_alerts": { "email": true, "push": false },
  "system_updates": { "email": false, "push": false }
}
```

**Cardinality:** 1 user → 1 preferences row (upsert pattern).
**Delete behavior:** ON DELETE CASCADE from user.

**⚠ UNCERTAINTY:** Whether notification preferences should be per-user (as specified) or per-organization with user overrides. Per-user is simpler and sufficient for MVP. Org defaults can be added later.

---

## 8. Derived Values — Do NOT Persist

The following values are computed at the API layer or via database views. They should NOT be stored as columns.

### 8.1 Sprint Metrics

| Metric | Calculation | Implementation |
|--------|-------------|----------------|
| Sprint progress % | `(completed_points / total_points) * 100` | SQL view or API |
| Sprint remaining points | `total_points - completed_points` | SQL view or API |
| Sprint remaining days | `end_date - CURRENT_DATE` | SQL view or API |
| Sprint velocity | `completed_points` of last completed sprint for the project | API query |
| Column task counts | `COUNT(tasks WHERE column_status = X AND sprint_id = Y)` | SQL query or API aggregation |
| Sprint duration string | `end_date - start_date` formatted as "2 weeks" | API formatting |

### 8.2 Project Metrics

| Metric | Calculation | Implementation |
|--------|-------------|----------------|
| Project progress | Already stored as `projects.progress` but should be **recalculated** from task completion | API recalculation or trigger |
| Active projects count | `COUNT(projects WHERE status = 'active' AND organization_id = X)` | SQL query |
| Team size | `COUNT(project_members WHERE project_id = X)` | SQL query |
| Current sprint name | `sprints.name WHERE project_id = X AND status = 'active'` | SQL query |
| Requirements ratio | `COUNT(requirements WHERE status = 'completed') / COUNT(requirements)` | SQL query |
| Budget spent total | `SUM(budget_line_items.spent WHERE project_id = X)` | SQL query |
| Budget status | Derived from `SUM(spent) / projects.budget_total` ratio | API |
| Budget variance | `((SUM(spent) / budget_total) - 1) * 100` | API |
| SDLC timeline stage | Derived from project status, sprint completion, milestones | API computation |

### 8.3 User/Team Metrics

| Metric | Calculation | Implementation |
|--------|-------------|----------------|
| User project count | `COUNT(project_members WHERE user_id = X)` | SQL query |
| Team member count | `COUNT(team_members WHERE team_id = X)` | SQL query |
| Role user count | `COUNT(organization_members WHERE organization_id = X AND role = Y)` | SQL query |
| User initials | `LEFT(first_name, 1) + LEFT(last_name, 1)` | API or computed column |
| Contribution % | `member_completed_points / total_sprint_points * 100` | API |
| Team workload | `COUNT(tasks WHERE assignee_id = X AND column_status = Y)` per user | SQL aggregation |

### 8.4 Governance Metrics

| Metric | Calculation | Implementation |
|--------|-------------|----------------|
| Budget remaining | `allocated - spent` per line item | SQL view |
| Budget status | `CASE WHEN spent/allocated > 1 THEN 'overbudget' WHEN spent/allocated > 0.9 THEN 'at_risk' ELSE 'ontrack' END` | SQL view |
| Risk severity | `CASE WHEN probability = 'high' AND impact = 'high' THEN 'critical' ...` | API computation |
| Milestone display status | `CASE WHEN completed THEN 'completed' WHEN target_date <= CURRENT_DATE THEN 'current' ELSE 'upcoming' END` | SQL view |
| Folder document count | `COUNT(documents WHERE folder_id = X)` | SQL query |

### 8.5 Dashboard Metrics

| Metric | Calculation | Implementation |
|--------|-------------|----------------|
| Active projects | `COUNT(projects WHERE status = 'active' AND organization_id = X)` | SQL query |
| Team members | `COUNT(DISTINCT user_id FROM organization_members WHERE organization_id = X)` | SQL query |
| Upcoming deadlines | `COUNT(sprints WHERE end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND project_id IN (SELECT id FROM projects WHERE organization_id = X))` | SQL query |
| Need attention | `COUNT(items WHERE status IN blocking states)` | SQL query |

### 8.6 Filter Counts

| Metric | Calculation | Implementation |
|--------|-------------|----------------|
| Project filter counts | `COUNT(projects GROUP BY status WHERE organization_id = X)` | SQL query |
| Requirement filter counts | `COUNT(requirements GROUP BY status WHERE project_id = X)` | SQL query |

---

## 9. Deferred Entities

The following entities are explicitly NOT part of this specification. They may be added in future iterations.

### 9.1 Calendar Events Table

**Status:** DEFERRED

The calendar page can initially derive events from `sprints` (start/end dates) and `milestones` (target_date). User-created events (meetings, arbitrary deadlines) require a `calendar_events` table which is deferred until the feature is fully specified.

**When implementing later:**
- Store only user-created events (type = 'meeting')
- Sprint events derived from `sprints.start_date` / `sprints.end_date`
- Milestone events derived from `milestones.target_date`
- API merges all sources before returning to frontend

### 9.2 Calendar Events (Full Table Spec — For Future Reference)

```
calendar_events (DEFERRED)
├── id: uuid (PK)
├── project_id: uuid (FK → projects, NOT NULL, CASCADE)
├── title: text (NOT NULL)
├── event_date: date (NOT NULL)
├── event_time: time (NULLABLE) — NULL for all-day events
├── event_type: text (NOT NULL) — 'meeting' only for stored events
├── description: text (NULLABLE)
├── created_by: uuid (FK → users, NOT NULL)
├── created_at: timestamptz (NOT NULL, DEFAULT now())
├── updated_at: timestamptz (NOT NULL, DEFAULT now())
```

### 9.3 Other Deferred Entities

| Entity | Reason Deferred | Future Consideration |
|--------|----------------|---------------------|
| Export persistence | Reports are client-generated and streamed | Add `report_exports` table if scheduled reports needed |
| File attachments (beyond documents) | No attachment UI on tasks/requirements | Could use `documents` table with polymorphic reference |
| Document folder permissions | No permission UI; defer to RLS | Folder-level permissions via RLS policies |
| SDLC phase tracking | Derived from project status + sprint progress | Not user-defined; computed at API layer |
| Task subtasks | Not in frontend mock | Could add `parent_task_id` self-reference later |
| Comment system | Not in frontend | Could add `comments` table with polymorphic reference |
| Time tracking | Not in frontend | Could add `time_entries` table linked to tasks |

---

## 10. Enum Reference

### 10.1 Existing Enums (KEEP)

| Enum Name | Values | Used By |
|-----------|--------|---------|
| `user_role` | ADMIN, PROJECT_MANAGER, DEVELOPER | `organization_members.role` (was `users.role`) |
| `user_status` | active, inactive | `users.status` |
| `project_status` | active, inactive, pending, completed, blocked | `projects.status` |
| `project_method` | scrum, kanban, waterfall, hybrid, incremental, prototyping, spiral, agile, xp | `projects.method` |
| `priority_level` | high, medium, low | `projects.priority`, `requirements.priority`, `requirements.business_value`, `tasks.priority`, `notifications.priority`, `change_requests.impact`, `ai_predictions.suggested_priority` |
| `sprint_status` | planning, active, completed, cancelled | `sprints.status` |
| `requirement_status` | draft, pending, inProgress, review, testing, completed, blocked | `requirements.status` |
| `requirement_category` | feature, bug, enhancement, security, uiux, performance, database, api, documentation | `requirements.category` |
| `task_column_status` | backlog, todo, inProgress, review, testing, done | `tasks.column_status` |
| `recommendation_status` | pending, approved, rejected | `ai_predictions.recommendation_status` |
| `invitation_status` | pending, expired, accepted, rejected | `invitations.status` |

### 10.2 New Enums (ADD)

| Enum Name | Values | Used By | Rationale |
|-----------|--------|---------|-----------|
| `document_type` | pdf, doc, image, code, spreadsheet, other | `documents.file_type` | Type safety for document categories |
| `contract_status` | active, pending, expired, terminated | `contracts.status` | Contract lifecycle states |
| `approval_type` | scope, budget, vendor, resource | `approvals.type` | Approval category classification |
| `approval_status` | pending, approved, rejected | `approvals.status` | Approval lifecycle (separate from `recommendation_status`) |
| `risk_level` | high, medium, low | `risks.probability`, `risks.impact` | Distinct from `priority_level` for semantic clarity |
| `risk_status` | open, mitigated, closed | `risks.status` | Risk lifecycle |
| `change_request_type` | feature, technical, process | `change_requests.type` | Change classification |
| `change_request_status` | pending, approved, rejected | `change_requests.status` | Change request lifecycle |
| `activity_action` | created, updated, deleted, approved, rejected, completed, assigned, commented | `activity_logs.action` | Typed activity actions (was plain text) |
| `entity_type_enum` | project, requirement, task, sprint, team, document, budget, approval, risk, change_request | `activity_logs.entity_type` | Typed entity references (was plain text) |
| `notification_type` | task, sprint, approval, document, budget, system | `notifications.type` | Typed notification categories (was plain text) |

### 10.3 Enums NOT Created

| Enum | Reason |
|------|--------|
| `org_role` | Not needed. SmartSprint has exactly 3 roles (ADMIN, PROJECT_MANAGER, DEVELOPER). `organization_members.role` reuses the existing `user_role` enum. |
| `project_role` | Not needed. No per-project roles. Authorization is org-scoped. |
| `milestone_status` | Not needed. Status is derived from `completed` + `target_date`. Storing it creates synchronization risk. |
| `budget_status` | Not needed. Status is derived from spent/allocated ratio. |
| `calendar_event_type` | Not needed. Calendar events table is deferred. |

---

## 11. Complete ER Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      organizations                          │
├─────────────────────────────────────────────────────────────┤
│ id (UUID PK)                                                │
│ name (TEXT NOT NULL)                                        │
│ slug (TEXT UNIQUE NOT NULL)                                 │
│ industry (TEXT)                                             │
│ timezone (TEXT)                                             │
│ created_at (TIMESTAMPTZ)                                   │
│ updated_at (TIMESTAMPTZ)                                   │
└───────────┬─────────────────────────────────────────────────┘
            │
            ├──┐ organization_members
            │  ├── organization_id (FK → organizations, PK)
            │  ├── user_id (FK → users, PK)
            │  ├── role (user_role: ADMIN|PROJECT_MANAGER|DEVELOPER)
            │  └── created_at
            │
            ├── projects
            │   ├── id (UUID PK)
            │   ├── organization_id (FK → organizations)
            │   ├── name, code, description, client
            │   ├── manager_id (FK → users)
            │   ├── method, status, priority, progress
            │   ├── start_date, end_date
            │   ├── budget_total, budget_currency
            │   └── created_at, updated_at
            │
            ├── teams
            │   ├── id (UUID PK)
            │   ├── organization_id (FK → organizations)
            │   ├── name, lead_id (FK → users)
            │   └── created_at, updated_at
            │
            └── invitations
                ├── id (UUID PK)
                ├── organization_id (FK → organizations)
                ├── email, role, status
                ├── invited_by (FK → users)
                ├── expires_at
                └── created_at

┌─────────────────────────────────────────────────────────────┐
│                         users                                │
├─────────────────────────────────────────────────────────────┤
│ id (UUID PK → auth.users)                                   │
│ first_name, last_name, email (UNIQUE)                       │
│ department, job_title                                       │
│ status (user_status)                                        │
│ avatar_initials, avatar_url                                 │
│ last_active_at                                              │
│ created_at, updated_at                                      │
└───────────┬─────────────────────────────────────────────────┘
            │
            ├── organization_members (see above)
            ├── project_members
            │   ├── project_id (FK → projects, PK)
            │   └── user_id (FK → users, PK)
            ├── team_members
            │   ├── team_id (FK → teams, PK)
            │   └── user_id (FK → users, PK)
            ├── tasks.assignee_id
            ├── requirements.assignee_id
            ├── teams.lead_id
            ├── projects.manager_id
            ├── user_preferences (1:1)
            ├── notifications (1:many)
            └── activity_logs.user_id

┌─────────────────────────────────────────────────────────────┐
│                       projects (cont.)                       │
└────┬──────────┬──────────┬──────────┬──────────┬────────────┘
     │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼
  sprints   requirements  tasks    backlog   project_members
     │          │          │          │          │
     │          │          │          │          └── project_id + user_id
     │          │          │          └── project_id + requirement_id + rank
     │          │          │
     │          │          ├── sprint_id (FK → sprints)
     │          │          ├── requirement_id (FK → requirements)
     │          │          ├── project_id (FK → projects)
     │          │          └── assignee_id (FK → users)
     │          │
     │          ├── sprint_id (FK → sprints)
     │          ├── assignee_id (FK → users)
     │          └── dependency_id (self-ref FK)
     │
     └── project_id (FK → projects)

┌─────────────────────────────────────────────────────────────┐
│                   Governance (all → projects)                │
├─────────────────────────────────────────────────────────────┤
│ budget_line_items → project_id, category, allocated, spent  │
│ contracts → project_id, name, vendor, value, status         │
│ approvals → project_id, title, type, status, requester_id   │
│ risks → project_id, title, probability, impact, owner_id    │
│ change_requests → project_id, display_id, type, impact      │
│ milestones → project_id, name, target_date, completed       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   Documents (all → projects)                 │
├─────────────────────────────────────────────────────────────┤
│ folders → project_id, parent_id (self-ref), name            │
│ documents → project_id, folder_id, name, file_type,         │
│             storage_path, owner_id, version, parent_version  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   Application Layer                          │
├─────────────────────────────────────────────────────────────┤
│ ai_predictions → requirement_id, suggested_sprint_id,       │
│                  recommendation_status, approved_by          │
│ activity_logs → organization_id, project_id, user_id,       │
│                 action (enum), entity_type (enum)            │
│ notifications → user_id, type (enum), priority, read        │
│ user_preferences → user_id (PK), theme, notification_prefs  │
└─────────────────────────────────────────────────────────────┘
```

---

## 12. Uncertainty Register

| ID | Topic | Uncertainty | Impact | Resolution / Recommendation |
|----|-------|-------------|--------|----------------------------|
| U1 | `users.role` removal | Removing the column is a breaking change for any existing code that reads it. | Medium | Remove the column. Authorization must use `organization_members.role`. Any code reading `users.role` must be updated. This is a clean break that prevents dual-authority confusion. |
| U2 | Project members role | Frontend team page shows role descriptions per user, but the task forbids additional roles. | Low | The frontend role descriptions are informational UI text, not database values. The three roles (ADMIN, PROJECT_MANAGER, DEVELOPER) apply at the org level. Project access is membership-based. |
| U3 | Document versioning | Frontend mock shows "v1.2" semantic versioning. | Low | Use integer versioning (v1, v2, v3). Frontend adapts display. Semantic versioning adds complexity for minimal benefit. |
| U4 | Calendar events | Whether to implement now or defer. | Medium | DEFER. Sprint and milestone events are derivable. User-created events (meetings) are low-priority for MVP. |
| U5 | Task progress storage | Whether to store `progress` column on tasks or derive from `column_status`. | Low | Derive from `column_status`. A stored progress value risks becoming stale or inconsistent with the actual status. |
| U6 | `approval_status` vs `recommendation_status` | Both use "pending/approved/rejected" but are separate enums. | Low | Keep separate. They represent different workflows (governance approvals vs AI recommendations). Merging would conflate unrelated concerns. |
| U7 | `risk_level` vs `priority_level` | Both have values "high/medium/low". Creating a separate enum adds proliferation. | Low | Keep separate for semantic clarity and future divergence. A "critical" risk level may be added later without affecting priorities. |
| U8 | Documents page project context | Frontend shows a flat folder list without project selector. | Medium | Assume project-scoped for now. If a global document center is needed, `project_id` on folders/documents can be made nullable in a future migration. |
| U9 | `display_id` generation | How are "REQ-001", "TASK-101", "CR-001" generated and scoped? | Low | Application-layer generation with project-scoping. Format: `{PREFIX}-{sequence_number}`. Sequence is per-project, per-entity-type. |
| U10 | Notification preferences JSONB | Whether JSONB or individual boolean columns. | Low | JSONB for flexibility. The notification types are a fixed UI-defined set, not a queryable domain. |

---

## Appendix A: Tables Summary

### Existing Tables — Modified

| Table | Changes |
|-------|---------|
| `users` | Remove `role` column. Remove self-referential FK. Add `job_title`, `avatar_url`, `last_active_at`. |
| `projects` | Add `organization_id`, `description`, `start_date`, `budget_total`, `budget_currency`. Make `code` NOT NULL (was nullable). |
| `teams` | Add `organization_id`, `updated_at`. |
| `invitations` | Add `organization_id`, `expires_at`. |
| `backlog` | Make `project_id` NOT NULL (was nullable). |
| `sprints` | Add index on `project_id`. |
| `requirements` | Make `display_id` NOT NULL (was nullable). |
| `tasks` | Add `description`, `due_date`. Make `display_id` NOT NULL (was nullable). |
| `ai_predictions` | Add `approved_by`, `approved_at`, `updated_at`. |
| `activity_logs` | Add `organization_id`. Change `action` and `entity_type` from text to enums. |
| `notifications` | Change `type` from text to enum. |

### New Tables

| Table | Purpose |
|-------|---------|
| `organizations` | Tenant root |
| `organization_members` | Org membership with role |
| `budget_line_items` | Per-category budget tracking |
| `contracts` | Vendor contract management |
| `approvals` | Governance approval workflow |
| `risks` | Project risk register |
| `change_requests` | Scope/technical change tracking |
| `milestones` | Project milestone tracking |
| `folders` | Document folder hierarchy |
| `documents` | File metadata + version tracking |
| `user_preferences` | UI preferences + notification settings |

### New Enums

| Enum | Values |
|------|--------|
| `document_type` | pdf, doc, image, code, spreadsheet, other |
| `contract_status` | active, pending, expired, terminated |
| `approval_type` | scope, budget, vendor, resource |
| `approval_status` | pending, approved, rejected |
| `risk_level` | high, medium, low |
| `risk_status` | open, mitigated, closed |
| `change_request_type` | feature, technical, process |
| `change_request_status` | pending, approved, rejected |
| `activity_action` | created, updated, deleted, approved, rejected, completed, assigned, commented |
| `entity_type_enum` | project, requirement, task, sprint, team, document, budget, approval, risk, change_request |
| `notification_type` | task, sprint, approval, document, budget, system |

---

## Appendix B: Migration Order

The implementation should follow this order to maintain system integrity at each step:

1. **Organizations foundation** — Create `organizations` table, `organization_members` table with `user_role` enum.
2. **Tenant-scope existing tables** — Add `organization_id` to `projects`, `teams`, `invitations`, `activity_logs`.
3. **User profile enrichment** — Add `job_title`, `avatar_url`, `last_active_at` to `users`. Remove `role` column and self-referential FK.
4. **Core column additions** — Add `description`, `start_date`, `budget_total`, `budget_currency` to `projects`. Add `description`, `due_date` to `tasks`. Make `display_id` NOT NULL on `requirements` and `tasks`. Make `project_id` NOT NULL on `backlog`.
5. **AI predictions enhancement** — Add `approved_by`, `approved_at`, `updated_at`.
6. **Governance tables** — Create `budget_line_items`, `contracts`, `approvals`, `risks`, `change_requests`, `milestones`.
7. **Document management** — Create `folders`, `documents` tables.
8. **Application tables** — Create `user_preferences`. Update `activity_logs` and `notifications` columns to enums.
9. **Supabase Storage** — Create `project-documents` and `avatars` buckets with RLS policies.
10. **RLS policies** — Enable and configure row-level security on all tables.
11. **Signup trigger** — Create `auth.users` → `public.users` profile trigger.
