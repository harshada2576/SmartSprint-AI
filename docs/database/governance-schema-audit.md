# Governance Schema Audit — SmartSprint AI

Architectural evidence for governance-related entities: budgets, contracts, approvals, risks, change requests, and milestones.

Generated: 2026-09-02

---

## Table of Contents

1. [Scope](#1-scope)
2. [Existing Schema Coverage](#2-existing-schema-coverage)
3. [Entity Analysis](#3-entity-analysis)
   - 3.1 [Budgets](#31-budgets)
   - 3.2 [Contracts](#32-contracts)
   - 3.3 [Approvals](#33-approvals)
   - 3.4 [Risks](#34-risks)
   - 3.5 [Change Requests](#35-change-requests)
   - 3.6 [Milestones](#36-milestones)
4. [Cross-Cutting Concerns](#4-cross-cutting-concerns)
5. [Recommended Schema](#5-recommended-schema)
6. [Recommended Enums](#6-recommended-enums)
7. [Uncertainties](#7-uncertainties)

---

## 1. Scope

This audit analyzes six governance entities identified by the frontend data mapping (`docs/database/frontend-data-mapping.md`) and cross-references them against:

- `supabase/schema.ts` (existing source of truth)
- Frontend mock data in `src/app/governance/page.tsx`
- Frontend mock data in `src/app/monitoring/page.tsx`
- Frontend mock data in `src/app/reports/page.tsx`
- Frontend mock data in `src/app/calendar/page.tsx`
- Frontend mock data in `src/app/projects/[id]/page.tsx`
- Frontend mock data in `src/app/projects/create/page.tsx`

**Existing schema has zero governance tables.** All six entities are schema gaps.

---

## 2. Existing Schema Coverage

The current schema (`supabase/schema.ts`) provides the project foundation that governance entities will attach to:

| Relevant Existing Table | Governance Relevance |
|------------------------|---------------------|
| `projects` | All governance entities are project-scoped. `projects.id` is the FK target. |
| `users` | Owner, requester, approver fields reference `users.id`. |
| `activity_logs` | Governance state changes should emit activity log entries. |
| `notifications` | Governance events (approvals needed, risks flagged) should generate notifications. |

**No governance-related enums exist.** All governance enums must be created.

**No governance-related tables exist.** All must be created from scratch.

---

## 3. Entity Analysis

---

### 3.1 Budgets

#### Frontend Evidence

**Governance page** (`src/app/governance/page.tsx:36-41`):
```ts
{ id: 1, category: "Development", allocated: 120000, spent: 95000, remaining: 25000, status: "ontrack" }
```
Table columns: Category, Allocated, Spent, Remaining, Status.

**Reports page** (`src/app/reports/page.tsx:63-74`):
```ts
const budgetReport = {
  totalBudget: 200000, spent: 145000, remaining: 55000, variance: 5,
  categories: [{ name: "Development", budget: 120000, spent: 95000 }, ...]
};
```
Aggregate view: total/remaining/variance + per-category breakdown.

**Create Project page** (`src/app/projects/create/page.tsx:202-243`):
Budget tab collects: Estimated Budget, Approved Budget, Currency, and a dynamic list of Cost Categories (name + amount).

**Project Detail page** (`src/app/projects/[id]/page.tsx:62`):
Stats card: `"Budget": "$145K/$200K"` — a summary string derived from budget data.

**Monitoring page** (`src/app/monitoring/page.tsx:31`):
Health indicator: `"Budget Status": "On Track"` — derived from budget data.

#### Analysis

The budget concept has two distinct layers:

| Layer | What | Where Used |
|-------|------|-----------|
| **Project-level budget metadata** | Total budget, approved budget, currency | Create Project form, Project Detail stats |
| **Budget line items** | Category name + allocated amount + spent amount | Governance table, Reports categories |

The "remaining" column in the governance table is `allocated - spent` (derivable).
The "status" (ontrack/overbudget/at_risk) is derivable from the spent/allocated ratio.
The "variance" in reports is `(spent / totalBudget) * 100 - 100` (derivable).

**Should remaining, status, and variance be stored?** No. They are pure derivations of `allocated` and `spent`. Storing them creates update anomalies.

#### Required Fields

**Project-level budget** (added to `projects` table):
- `budget_total` (numeric) — approved total budget
- `budget_currency` (text) — ISO 4217 currency code

**Budget line items** (new table):
- `id` (uuid, PK)
- `project_id` (uuid, FK → projects)
- `category` (text) — e.g. "Development", "Design", "Testing", "Infrastructure"
- `allocated` (numeric) — allocated amount
- `spent` (numeric) — spent amount (default 0)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### Relationships

- `budget_line_items.project_id → projects.id` (cascade delete)
- Budget line items aggregate to project totals via `SUM(allocated)`, `SUM(spent)`

#### Lifecycle / Status

Budget line items have no workflow. They are created during project setup and updated as spending occurs. Status is derived at query time.

#### Ownership

Budget line items are managed by ADMIN and PROJECT_MANAGER roles (governance page is role-gated per the frontend mapping section 9.2).

#### Verdict

**KEEP** — New table `budget_line_items`. Add `budget_total` and `budget_currency` columns to `projects`.

**Rationale:** The frontend explicitly shows a per-category breakdown table and a project-level budget summary. These are distinct data needs. The per-category table cannot be derived from a single `projects.budget_total` column. The summary metrics are derived from the line items + project total.

**Challenge to frontend audit:** The frontend audit proposed a single `budgets` table. This audit splits it into project-level columns (for the summary) and a separate line-items table (for the category breakdown). A single table with a nullable `category` column for the "summary" row would work but is an anti-pattern. Two clear concerns → two storage mechanisms.

---

### 3.2 Contracts

#### Frontend Evidence

**Governance page** (`src/app/governance/page.tsx:43-47`):
```ts
{ id: 1, name: "Master Service Agreement", vendor: "TechCorp Solutions",
  value: 150000, status: "active", expiry: "2025-12-31" }
```
Table columns: Contract, Vendor, Value, Status, Expiry.

#### Analysis

This is a straightforward entity. Five data fields plus a project relationship. No derivations. No complex lifecycle. The frontend only shows this on the governance page.

**Can it use an existing table?** No. No existing table models vendor agreements.

**Is it over-normalized?** No. Each contract has distinct name, vendor, value, status, and expiry. These cannot be derived from other entities.

#### Required Fields

- `id` (uuid, PK)
- `project_id` (uuid, FK → projects)
- `name` (text) — contract name
- `vendor` (text) — vendor/party name
- `value` (numeric) — contract value
- `status` (enum) — active/pending/expired/terminated
- `expiry` (date, nullable) — expiration date
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### Relationships

- `contracts.project_id → projects.id` (cascade delete)

#### Lifecycle / Status

Contracts have a simple status: pending → active → expired/terminated. No multi-step approval workflow is visible in the frontend (the approval tab is separate from contracts).

#### Ownership

Managed by ADMIN and PROJECT_MANAGER roles.

#### Verdict

**KEEP** — New table `contracts`.

**Rationale:** Clean, minimal entity with clear ownership and lifecycle. No overlap with other entities. The frontend audit's proposal is correct.

---

### 3.3 Approvals

#### Frontend Evidence

**Governance page** (`src/app/governance/page.tsx:49-53`):
```ts
{ id: 1, title: "Sprint 4 Scope Change", requester: "John Smith",
  type: "scope", status: "pending", requested: "2025-07-20" }
```
Table columns: Title, Requester, Type, Status, Requested.

**Types visible in mock data:** "scope", "budget", "vendor".

**Project Detail page** (`src/app/projects/[id]/page.tsx:67`):
```ts
{ type: "approval", title: "2 pending approvals", action: "View" }
```
Actionable item linking to approvals — confirms project-scoping.

**AI Recommendations page** (`src/app/ai-recommendations/page.tsx`):
AI predictions have their own `recommendation_status` (pending/approved/rejected) in the existing `ai_predictions` table. This is a **separate** approval concept — AI recommendation approval vs. general governance approval. They should NOT be merged.

#### Analysis

**Key question: Should approvals be polymorphic?**

The mock data shows approvals with different types ("scope", "budget", "vendor"). A polymorphic design would use:
- `approvals.target_type` (text) — e.g. "requirement", "contract", "budget_line_item"
- `approvals.target_id` (uuid) — the referenced entity

However, examining the mock data carefully:
- "Sprint 4 Scope Change" — references a requirement or sprint scope
- "Budget Increase - Development" — references a budget category
- "Vendor Selection - Analytics" — references a potential contract

The approval targets are heterogeneous. A polymorphic FK (`target_type` + `target_id`) is the right pattern here because:
1. The approval types are genuinely different entity types
2. Adding a new FK column for each possible target is not extensible
3. Supabase/Postgres handles this pattern well with text + uuid columns

**Alternative: No polymorphic reference.** Just store title/type/status and let the business logic handle what is being approved. The mock data does not show a clickable link to the approved entity — it only shows title and status. This suggests the approval is self-contained and the reference is informational, not navigational.

**Recommendation:** Use a lightweight polymorphic reference. Include `target_type` and `target_id` as nullable columns. The title and type fields provide enough context even without the reference. The reference enables future drill-down without schema changes.

#### Required Fields

- `id` (uuid, PK)
- `project_id` (uuid, FK → projects)
- `title` (text) — what is being approved
- `requester_id` (uuid, FK → users) — who requested
- `type` (enum) — scope/budget/vendor/resource
- `status` (enum) — pending/approved/rejected
- `target_type` (text, nullable) — polymorphic entity type reference
- `target_id` (uuid, nullable) — polymorphic entity ID reference
- `notes` (text, nullable) — comments/justification
- `requested_at` (timestamp) — when requested (maps to frontend "requested" date)
- `decided_at` (timestamp, nullable) — when approved/rejected
- `decided_by` (uuid, FK → users, nullable) — who decided
- `created_at` (timestamp)

#### Relationships

- `approvals.project_id → projects.id` (cascade delete)
- `approvals.requester_id → users.id` (set null)
- `approvals.decided_by → users.id` (set null)

#### Lifecycle / Status

Pending → Approved | Rejected. No multi-step workflow visible. Single decision point.

#### Ownership

Managed by ADMIN and PROJECT_MANAGER roles. Developers cannot create or approve (governance page is admin/PM only per section 9.2).

#### Verdict

**KEEP** — New table `approvals`.

**Rationale:** The frontend shows a distinct approval workflow with its own status lifecycle. It is not a subtype of any existing entity. The polymorphic reference is optional but recommended for extensibility.

**Challenge to frontend audit:** The frontend audit proposed approvals without noting that AI recommendation approvals are a separate system. These are correctly separate — `ai_predictions.recommendation_status` handles AI approvals, while `approvals` handles governance-level approvals. Do not merge them.

---

### 3.4 Risks

#### Frontend Evidence

**Governance page** (`src/app/governance/page.tsx:55-59`):
```ts
{ id: 1, title: "Payment API Integration Delay", probability: "high",
  impact: "high", owner: "John Smith", mitigation: "Contact vendor for expedited support" }
```
Table columns: Risk, Probability, Impact, Owner.

**Monitoring page** (`src/app/monitoring/page.tsx:67-70`):
```ts
{ id: 1, title: "Payment API delays", severity: "high",
  owner: "John Smith", mitigation: "Contact vendor for expedited support" }
```
Sidebar card with: Severity, Owner, Mitigation.

**Key difference:** The governance page shows separate `probability` and `impact` fields. The monitoring page shows a single `severity` field. The monitoring page's "severity" is likely a derived value from probability × impact (a risk matrix calculation), not a separate stored field.

#### Analysis

The risk data is simple and clearly project-scoped. The `severity` shown on the monitoring page is derivable from `probability` and `impact` — it should NOT be stored as a separate column. This avoids the update anomaly where someone changes probability but not severity.

**Can it use an existing table?** No. No existing table models risks.

**Is it over-normalized?** No. Each risk has a distinct title, probability, impact, owner, and mitigation strategy.

#### Required Fields

- `id` (uuid, PK)
- `project_id` (uuid, FK → projects)
- `title` (text) — risk description
- `probability` (enum) — high/medium/low
- `impact` (enum) — high/medium/low
- `owner_id` (uuid, FK → users, nullable) — risk owner
- `mitigation` (text, nullable) — mitigation strategy
- `status` (enum) — open/mitigated/closed
- `created_at` (timestamp)
- `updated_at` (timestamp)

**Note on `status`:** The mock data does not show a status field, but risks need a lifecycle (open → mitigated → closed). Without it, risks can only be deleted, not resolved. Include it.

**Note on `severity`:** Derive at query time: `CASE WHEN probability = 'high' AND impact = 'high' THEN 'critical' WHEN ...`. Do not store.

#### Relationships

- `risks.project_id → projects.id` (cascade delete)
- `risks.owner_id → users.id` (set null)

#### Lifecycle / Status

Open → Mitigated → Closed. Simple lifecycle. The "severity" display is a derived risk score.

#### Ownership

Managed by ADMIN and PROJECT_MANAGER roles.

#### Verdict

**KEEP** — New table `risks`.

**Rationale:** Clean entity with clear fields visible in both governance and monitoring pages. The dual-page usage (governance table + monitoring sidebar) confirms it is a first-class entity.

**Challenge to frontend audit:** The monitoring page's "severity" field is derived, not stored. The frontend data mapping lists it as UNMAPPED but does not note the derivation. The API layer should compute severity from probability × impact.

---

### 3.5 Change Requests

#### Frontend Evidence

**Governance page** (`src/app/governance/page.tsx:61-65`):
```ts
{ id: "CR-001", title: "Add social login options", type: "feature",
  impact: "medium", status: "approved", requester: "Product Team", date: "2025-07-15" }
```
Table columns: ID, Title, Type, Impact, Status, Requester.

**Types visible:** "feature", "technical".
**Impacts visible:** "medium", "high", "low".

#### Analysis

Change requests have their own display ID format ("CR-001"), distinct from requirements ("REQ-001") and tasks ("TASK-101"). They have a unique workflow: submitted → pending → approved/rejected.

**Can they reuse the approvals table?** No. Change requests have their own identity (CR-001), their own type classification (feature/technical/process), and their own lifecycle. An approval is a lightweight record about a decision. A change request is a substantive proposal with its own metadata. They are different concepts.

**Can they use an existing table?** No.

#### Required Fields

- `id` (uuid, PK)
- `display_id` (text, unique) — e.g. "CR-001" (auto-generated)
- `project_id` (uuid, FK → projects)
- `title` (text)
- `description` (text, nullable) — detailed change description
- `type` (enum) — feature/technical/process
- `impact` (enum) — high/medium/low
- `status` (enum) — pending/approved/rejected
- `requester_id` (uuid, FK → users, nullable) — who requested
- `requester_name` (text, nullable) — denormalized display name (the mock data shows "Product Team", "Engineering", "DevOps" — these are team names, not user IDs)
- `requested_at` (timestamp) — when submitted
- `decided_at` (timestamp, nullable) — when approved/rejected
- `created_at` (timestamp)
- `updated_at` (timestamp)

**Note on `requester_name`:** The mock data shows organizational team names ("Product Team", "Engineering"), not individual user names. This suggests change requests may be submitted by a team rather than an individual. Include both `requester_id` (for user-based requests) and `requester_name` (for team-based or fallback display). This is a pragmatic denormalization.

#### Relationships

- `change_requests.project_id → projects.id` (cascade delete)
- `change_requests.requester_id → users.id` (set null)

#### Lifecycle / Status

Pending → Approved | Rejected. Single decision point.

#### Ownership

Managed by ADMIN and PROJECT_MANAGER roles.

#### Verdict

**KEEP** — New table `change_requests`.

**Rationale:** The frontend shows a distinct entity with its own display ID format, type classification, and lifecycle. It cannot be merged with approvals (different purpose, different metadata) or requirements (different lifecycle).

---

### 3.6 Milestones

#### Frontend Evidence

**Monitoring page** (`src/app/monitoring/page.tsx:45-51`):
```ts
{ id: 1, name: "Project Kickoff", date: "2025-01-15", status: "completed" }
{ id: 4, name: "Beta Release", date: "2025-08-01", status: "current" }
{ id: 5, name: "Production Launch", date: "2025-09-15", status: "upcoming" }
```
Timeline list with: name, date, status (completed/current/upcoming).

**Create Project page** (`src/app/projects/create/page.tsx:182-196`):
Timeline tab: dynamic list of milestones with name + date.

**Project Detail page** (`src/app/projects/[id]/page.tsx:72-79`):
SDLC timeline — but this is a different concept (project phases, not milestones):
```ts
{ stage: "Initiation", status: "completed", date: "Jan 15" }
{ stage: "Development", status: "current", date: "In Progress" }
```
These are fixed SDLC phases, not user-defined milestones.

**Calendar page** (`src/app/calendar/page.tsx:27`):
```ts
{ id: 3, title: "Client Review", date: "2025-07-23", type: "milestone", time: "2:00 PM" }
```
Calendar event with `type: "milestone"` — milestones appear as calendar events.

#### Analysis

**Key question: Can milestones be calendar events?**

The calendar page shows events with types: "sprint", "meeting", "milestone", "deadline", "document". A dedicated `calendar_events` table could model all of these. However:

1. The monitoring page shows milestones as a timeline with status progression (completed → current → upcoming). Calendar events don't have this concept.
2. The create project form has a dedicated "Milestones" section in the timeline tab. Milestones are created during project setup, not as arbitrary calendar events.
3. Milestones represent project-level achievements with temporal ordering. Calendar events represent point-in-time occurrences.

**These are different concepts.** Milestones should be their own table. Calendar events can be derived from milestones (and sprints) at query time, or a separate `calendar_events` table can be created for user-created events.

**Status derivation:** The `status` (completed/current/upcoming) is derivable from the milestone `date` relative to today and whether the milestone has been marked complete. Store a boolean `completed` and derive the display status:
- `completed = true` → "completed"
- `completed = false AND date <= today` → "current" (or "overdue")
- `completed = false AND date > today` → "upcoming"

#### Required Fields

- `id` (uuid, PK)
- `project_id` (uuid, FK → projects)
- `name` (text) — milestone name
- `target_date` (date) — planned date
- `completed` (boolean, default false) — whether achieved
- `completed_at` (timestamp, nullable) — when achieved
- `sort_order` (integer) — ordering within project
- `created_at` (timestamp)
- `updated_at` (timestamp)

**Note on `status` enum:** Do NOT store a status enum. Derive it from `completed` + `target_date`. This avoids the synchronization problem where status and date become inconsistent.

#### Relationships

- `milestones.project_id → projects.id` (cascade delete)

#### Lifecycle / Status

Created → Achieved (completed = true). Simple lifecycle. The "current/upcoming" display status is derived from date comparison.

#### Ownership

Managed by ADMIN and PROJECT_MANAGER roles.

#### Verdict

**KEEP** — New table `milestones`.

**Rationale:** Milestones appear on two distinct pages (monitoring timeline + create project form) with semantics that cannot be derived from sprints or calendar events. They are first-class project metadata.

**Challenge to frontend audit:** The monitoring page's `status` field (completed/current/upcoming) is derivable, not stored. The frontend data mapping lists it as UNMAPPED but does not note the derivation. The API layer should compute display status from `completed` + `target_date`.

---

## 4. Cross-Cutting Concerns

### 4.1 Approval vs. Change Request Distinction

Both have status (pending/approved/rejected) and a requester. Why not merge them?

| Aspect | Approvals | Change Requests |
|--------|-----------|----------------|
| Identity | No display ID (auto-increment-like) | Display ID "CR-001" |
| Scope | Any decision (scope, budget, vendor, resource) | Substantive proposals (feature, technical, process) |
| Metadata | Light (title, type, status) | Heavy (title, type, impact, description) |
| Lifecycle | Single decision point | Submission → decision |
| Relationships | Polymorphic target reference | Self-contained with requester info |

**Verdict:** Keep separate. They serve different governance purposes.

### 4.2 Approval Integration with AI Predictions

The existing `ai_predictions` table has `recommendation_status` (pending/approved/rejected). This is the approval mechanism for AI-generated recommendations. It is NOT the same as governance approvals.

**Do not create a governance approval record for each AI recommendation approval.** These are independent workflows:
- AI recommendation approval: toggled on the AI Recommendations page, updates `ai_predictions.recommendation_status`
- Governance approval: created/decided on the Governance page, stored in `approvals` table

### 4.3 Calendar Events

The calendar page shows 5 event types: sprint, meeting, milestone, deadline, document. Of these:
- **Sprint events** are derivable from `sprints.start_date` and `sprints.end_date`
- **Milestone events** are derivable from `milestones.target_date` (if milestones table is created)
- **Meeting, deadline, document events** would require a `calendar_events` table

**Recommendation:** DEFER the `calendar_events` table. The calendar page can initially derive events from sprints and milestones. User-created events (meetings, arbitrary deadlines) can be added later when the feature is prioritized.

**Uncertainty:** It is unclear whether the calendar's "Add Event" button is intended for user-created events or just for sprint/milestone creation. The frontend mock only shows derived events. This should be clarified with the product owner before creating a `calendar_events` table.

### 4.4 Project Detail SDLC Timeline

The project detail page shows an SDLC timeline (`src/app/projects/[id]/page.tsx:72-79`):
```ts
{ stage: "Initiation", status: "completed", date: "Jan 15" }
{ stage: "Development", status: "current", date: "In Progress" }
```

**This is NOT milestones.** These are fixed SDLC phases (Initiation → Requirements → Design → Development → Testing → Deployment). They are:
1. The same for every project (not user-defined)
2. Derived from project status and sprint progress
3. Display-only (no CRUD operations visible)

**Verdict:** Do NOT create a table for SDLC timeline stages. Derive from project status, sprint completion, and milestone data. The API layer can compute which stage the project is in.

### 4.5 Budget in Reports and Monitoring

The reports page (`budgetReport`) and monitoring page (`healthIndicators[2]`) both display budget information. Both derive from the same budget data:
- Reports: `SUM(spent)` / `SUM(allocated)` per category
- Monitoring: Overall status string derived from spent/allocated ratio

No separate storage needed. Both query the `budget_line_items` table.

---

## 5. Recommended Schema

### 5.1 Changes to Existing Tables

#### `projects` — Add 2 columns

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `budget_total` | numeric | null | Approved total budget amount |
| `budget_currency` | text | 'USD' | ISO 4217 currency code |

**Rationale:** The create project form collects estimated/approved budget and currency at the project level. These are project-level metadata, not line items.

### 5.2 New Tables

#### `budget_line_items`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid | NO | PK, default gen_random_uuid() |
| `project_id` | uuid | NO | FK → projects (cascade) |
| `category` | text | NO | e.g. "Development", "Design" |
| `allocated` | numeric | NO | Allocated amount |
| `spent` | numeric | NO | Default 0 |
| `created_at` | timestamptz | NO | Default now() |
| `updated_at` | timestamptz | NO | Default now() |

**Indexes:** `idx_budget_line_items_project_id`

**Unique constraint:** `(project_id, category)` — one line item per category per project.

#### `contracts`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid | NO | PK, default gen_random_uuid() |
| `project_id` | uuid | NO | FK → projects (cascade) |
| `name` | text | NO | Contract name |
| `vendor` | text | NO | Vendor/party name |
| `value` | numeric | NO | Contract value |
| `status` | contract_status | NO | Enum, default 'pending' |
| `expiry` | date | YES | Expiration date |
| `created_at` | timestamptz | NO | Default now() |
| `updated_at` | timestamptz | NO | Default now() |

**Indexes:** `idx_contracts_project_id`

#### `approvals`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid | NO | PK, default gen_random_uuid() |
| `project_id` | uuid | NO | FK → projects (cascade) |
| `title` | text | NO | What is being approved |
| `requester_id` | uuid | YES | FK → users (set null) |
| `type` | approval_type | NO | Enum |
| `status` | approval_status | NO | Enum, default 'pending' |
| `target_type` | text | YES | Polymorphic entity type |
| `target_id` | uuid | YES | Polymorphic entity ID |
| `notes` | text | YES | Comments/justification |
| `requested_at` | timestamptz | NO | Default now() |
| `decided_at` | timestamptz | YES | When approved/rejected |
| `decided_by` | uuid | YES | FK → users (set null) |
| `created_at` | timestamptz | NO | Default now() |

**Indexes:** `idx_approvals_project_id`, `idx_approvals_status`

#### `risks`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid | NO | PK, default gen_random_uuid() |
| `project_id` | uuid | NO | FK → projects (cascade) |
| `title` | text | NO | Risk description |
| `probability` | risk_level | NO | Enum |
| `impact` | risk_level | NO | Enum |
| `owner_id` | uuid | YES | FK → users (set null) |
| `mitigation` | text | YES | Mitigation strategy |
| `status` | risk_status | NO | Enum, default 'open' |
| `created_at` | timestamptz | NO | Default now() |
| `updated_at` | timestamptz | NO | Default now() |

**Indexes:** `idx_risks_project_id`

**Severity:** Derived at query time from probability × impact. Do NOT store.

#### `change_requests`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid | NO | PK, default gen_random_uuid() |
| `display_id` | text | YES | Unique, e.g. "CR-001" |
| `project_id` | uuid | NO | FK → projects (cascade) |
| `title` | text | NO | Change request title |
| `description` | text | YES | Detailed description |
| `type` | change_request_type | NO | Enum |
| `impact` | priority_level | NO | Reuse existing priority_level enum |
| `status` | change_request_status | NO | Enum, default 'pending' |
| `requester_id` | uuid | YES | FK → users (set null) |
| `requester_name` | text | YES | Denormalized team/display name |
| `requested_at` | timestamptz | NO | Default now() |
| `decided_at` | timestamptz | YES | When approved/rejected |
| `created_at` | timestamptz | NO | Default now() |
| `updated_at` | timestamptz | NO | Default now() |

**Indexes:** `idx_change_requests_project_id`, `idx_change_requests_display_id`

**Note:** Reuses existing `priority_level` enum for impact (high/medium/low). No new enum needed.

#### `milestones`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid | NO | PK, default gen_random_uuid() |
| `project_id` | uuid | NO | FK → projects (cascade) |
| `name` | text | NO | Milestone name |
| `target_date` | date | NO | Planned date |
| `completed` | boolean | NO | Default false |
| `completed_at` | timestamptz | YES | When achieved |
| `sort_order` | integer | NO | Default 0, ordering within project |
| `created_at` | timestamptz | NO | Default now() |
| `updated_at` | timestamptz | NO | Default now() |

**Indexes:** `idx_milestones_project_id`

**Status display:** Derived at query time from `completed` + `target_date`. Do NOT store a status enum.

---

## 6. Recommended Enums

| Enum Name | Values | Reused By |
|-----------|--------|-----------|
| `contract_status` | active, pending, expired, terminated | `contracts.status` |
| `approval_type` | scope, budget, vendor, resource | `approvals.type` |
| `approval_status` | pending, approved, rejected | `approvals.status` |
| `risk_level` | high, medium, low | `risks.probability`, `risks.impact` |
| `risk_status` | open, mitigated, closed | `risks.status` |
| `change_request_type` | feature, technical, process | `change_requests.type` |
| `change_request_status` | pending, approved, rejected | `change_requests.status` |

**Note on `risk_level`:** This reuses the same values as the existing `priority_level` enum (high/medium/low). However, creating a distinct `risk_level` enum is safer because:
1. Risk levels may diverge from priority levels in the future (e.g. adding "critical" to risks)
2. Semantic clarity: "risk_level" is a different concept from "priority_level"
3. Migration safety: renaming an enum value affects all tables using it

**Uncertainty:** If the team prefers to minimize enum proliferation, `risk_level` could be replaced with `priority_level`. The frontend audit proposed `high/medium/low` for risk probability and impact, which matches `priority_level` exactly. The schema-finalization agent should decide based on future requirements.

---

## 7. Uncertainties

### 7.1 Budget Currency on Line Items vs. Project

**Question:** Should `budget_currency` be on `projects` or on each `budget_line_item`?

**Current recommendation:** On `projects`. The create project form has a single currency selector for the entire budget. Mixed-currency line items within a single project are unlikely.

**Risk:** If multi-currency per project is needed later, a migration would be required. This is acceptable for an MVP.

### 7.2 Contract Value Currency

**Question:** Should contracts have their own currency field, or inherit from the project budget?

**Current recommendation:** Contracts do NOT need a currency field. The mock data shows values as plain numbers ($150,000). If multi-currency contracts are needed, a `currency` column can be added later.

### 7.3 Change Request Display ID Generation

**Question:** How are "CR-001", "CR-002" etc. generated?

**Options:**
1. Database sequence with prefix (e.g. `CR-` + nextval)
2. Application-layer generation with project-scoping (e.g. `CR-{project_code}-{seq}`)
3. Simple auto-increment with prefix

**Recommendation:** Application-layer generation. The display_id is unique per project, not globally. Use `CR-{project_code}-{sequence_number}`.

**Uncertainty:** The mock data does not show project-scoped display IDs (all are CR-001, CR-002, CR-003 without project context). This should be clarified.

### 7.4 Approval Polymorphic Reference Completeness

**Question:** Should `target_type` + `target_id` be required or optional?

**Current recommendation:** Optional (nullable). Not all approvals reference a specific entity. The "Vendor Selection" approval in the mock data references a potential contract that doesn't exist yet.

### 7.5 Milestone Relationship to Sprints

**Question:** Can milestones be linked to specific sprints?

**Current recommendation:** No. Milestones are project-level markers with dates. They may coincidentally align with sprint boundaries, but they are not sprint-scoped. If sprint-level milestones are needed, a `sprint_id` FK can be added later.

### 7.6 Calendar Events Beyond Sprints and Milestones

**Question:** Should a `calendar_events` table be created now or deferred?

**Current recommendation:** DEFER. The calendar page's mock data shows events that are derivable from sprints and milestones. User-created events (meetings, arbitrary deadlines) should be added when the "Add Event" feature is fully specified.

---

## Summary Table

| Entity | Verdict | New Table? | New Columns on Existing? | Key Notes |
|--------|---------|-----------|-------------------------|-----------|
| Budgets | **KEEP** | `budget_line_items` | `projects.budget_total`, `projects.budget_currency` | Two-layer design: project summary + line items. Derive remaining/status/variance. |
| Contracts | **KEEP** | `contracts` | — | Clean entity, no derivations needed. |
| Approvals | **KEEP** | `approvals` | — | Polymorphic target reference. Separate from AI recommendation approvals. |
| Risks | **KEEP** | `risks` | — | Derive severity from probability × impact. Include status lifecycle. |
| Change Requests | **KEEP** | `change_requests` | — | Own display ID format. Denormalized `requester_name` for team names. |
| Milestones | **KEEP** | `milestones` | — | Derive display status from `completed` + `target_date`. |
| Calendar Events | **DEFER** | — | — | Derivable from sprints + milestones initially. |
| SDLC Timeline | **REMOVE** | — | — | Derived from project status + sprint progress. Not user-defined. |
