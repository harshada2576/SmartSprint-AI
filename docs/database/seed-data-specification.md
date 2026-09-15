# Seed Data Specification — SmartSprint AI

Design for the SmartSprint AI synthetic data generation system.

This is a **planning/architecture document**. It specifies quantities, relationships, archetypes, the generation pipeline, the future ML pipeline, and validation requirements. It does **NOT** generate data and does **NOT** modify the database schema.

Generated: 2026-09-02

---

## Table of Contents

1. [Purpose & Design Principles](#1-purpose--design-principles)
2. [Schema Baseline](#2-schema-baseline)
3. [Dataset Quantities](#3-dataset-quantities)
4. [Relationship Integrity Rules](#4-relationship-integrity-rules)
5. [Scenario Generation: Project Archetypes](#5-scenario-generation-project-archetypes)
6. [Temporal Data & Historical Snapshots](#6-temporal-data--historical-snapshots)
7. [Ground Truth Generation](#7-ground-truth-generation)
8. [LLM vs. Deterministic Field Split](#8-llm-vs-deterministic-field-split)
9. [ML Dataset Design](#9-ml-dataset-design)
10. [Dataset Formats](#10-dataset-formats)
11. [Validation Requirements](#11-validation-requirements)
12. [Complete Proposed Generation Pipeline](#12-complete-proposed-generation-pipeline)
13. [Uncertainty Register](#13-uncertainty-register)

---

## 1. Purpose & Design Principles

The synthetic dataset serves **two** purposes:

1. **Populate SmartSprint realistically** — every page, filter, sort, and dashboard in the frozen frontend must render meaningful data across all statuses, roles, and governance entities.
2. **Provide a foundation for future ML experimentation** — the data must contain realistic correlations and noise such that prediction models (sprint delay, task delay, workload, requirement risk, project risk) can be trained and evaluated.

### Guiding Rules

- **Not one giant LLM-generated JSON file.** The system is a **hybrid**: a deterministic generator produces structure/relationships/timestamps/metrics; an LLM produces semantic content (descriptions, titles, acceptance criteria); business rules govern status transitions; validators enforce integrity.
- **Prefer normalized, relational designs.** Reuse existing tables wherever possible.
- **Avoid duplicate concepts.** The audits explicitly warn against merged concepts (e.g., governance approvals vs. AI recommendation approvals; milestones vs. SDLC timeline; milestones vs. calendar events).
- **Outcomes are probabilistic, not deterministic labels.** The dataset must look realistic and support ML without hand-coded labels (see §7).
- **Uncertainty is labeled explicitly**, never silently resolved.

---

## 2. Schema Baseline

The generator must target the **final schema** produced by the schema-finalization agent. Since `docs/database/final-schema-specification.md` does not yet exist, this spec assumes the union of:

- The **existing** `supabase/schema.ts` tables (users, teams, projects, sprints, requirements, backlog, tasks, ai_predictions, activity_logs, notifications, team_members, project_members, invitations) and their enums.
- The **recommended additions** from the parallel audits (`docs/database/`) that are marked **KEEP** or high-priority. These are treated as *target tables to populate*, verified against the final schema before generation:

| Table Group | Source Audit | Classification |
|-------------|-------------|----------------|
| `organizations`, `organization_members` | core-schema-audit §4 | **High** (multi-tenancy foundation) |
| `budget_line_items` (+ `projects.budget_total`, `projects.budget_currency`) | governance-schema-audit §3.1 | **KEEP** |
| `contracts` | governance-schema-audit §3.2 | **KEEP** |
| `approvals` | governance-schema-audit §3.3 | **KEEP** |
| `risks` | governance-schema-audit §3.4 | **KEEP** |
| `change_requests` | governance-schema-audit §3.5 | **KEEP** |
| `milestones` | governance-schema-audit §3.6 | **KEEP** |
| `documents`, `folders` | documents-storage-calendar-audit §1–2 | **KEEP** (High) |
| `user_preferences` | documents-storage-calendar-audit §5 | **KEEP** (Low) |
| `calendar_events` | documents-storage-calendar-audit §4 | **MODIFY** (scope TBD) |

**Deferred / derived entities** — the generator must NOT create rows for these; it derives them at query time or omits them:

- **SDLC timeline stages** (project detail) — derived, not stored.
- **Calendar events for sprints/milestones** — derived in the hybrid approach; only user-created "meeting" events are stored (scope per audit uncertainty).
- **Exports** — client-generated, no table.

> **⚠ UNCERTAINTY (U-01):** The final schema does not exist yet. The generation pipeline must read the live schema (via Drizzle introspection or the finalized `schema.ts`) at run time and populate only tables that actually exist, erroring on unknown/missing tables. Column-level defaults (e.g., `display_id`, `progress`) must follow the finalized schema.

---

## 3. Dataset Quantities

Quantities below are for the **primary seed tenant** (the "Acme Corporation"-style org that maps to the frozen frontend's expected scale of ~5–10 projects, ~8–10 users, 3–4 teams). The pipeline also generates **secondary smaller tenants** to exercise multi-tenancy isolation (see §4 and §11).

### 3.1 Tenant 0 (Primary — "Acme Partnership")

| Entity | Quantity | Notes / Rationale |
|--------|----------|-------------------|
| `organizations` | 1 | The primary tenant representing the frontend's org. |
| `users` | 12 | 8–10 active + 2–3 inactive; covers roles (ADMIN, PROJECT_MANAGER, DEVELOPER) across departments. |
| `organization_members` | 12 | All 12 users; per-org roles (OWNER/ADMIN/MEMBER). |
| `teams` | 4 | Matches frontend "3–4 teams". Each 2–5 members. |
| `team_members` | ~14 | 4 teams × ~3.5 members; overlaps allowed (users may be in multiple teams). |
| `projects` | 8 | Covers all 5 project_status values and all archetypes (§5). 5 active, 1 pending, 1 completed, 1 blocked. |
| `project_members` | ~48 | ~6 members × 8 projects (varies by archetype). |
| `requirements` | ~120 | ~15 per project; diverse categories; includes backlog-only (unallocated) requirements. |
| `backlog` | ~120 | One entry per requirement (1:1), rank-ordered. |
| `sprints` | ~40 | ~3–8 per project (project-dependent); mix of planning/active/completed/cancelled. |
| `tasks` | ~400 | ~10–15 per sprint across backlog/todo/inProgress/review/testing/done columns. |
| `risks` | ~40 | ~4–6 per project (archetype-dependent). |
| `change_requests` | ~24 | ~3 per project; display_id `CR-001…` per project. |
| `milestones` | ~40 | ~5 per project, including created-during-setup and achieved. |
| `contracts` | ~16 | ~2 per project including governance-heavy projects. |
| `budget_line_items` | ~40 | ~5 categories per project (Development, Design, Testing, Infrastructure, etc.). |
| `approvals` | ~24 | ~3 per project; heterogeneous types (scope/budget/vendor/resource). |
| `documents` | ~60 | Across folders; multiple versions for some logical documents. |
| `folders` | ~32 | ~4 per project; supports nesting. |
| `user_preferences` | 12 | One row per user. |
| `notifications` | ~200 | Scoped per user; mixed types, priorities, read states. |
| `activity_logs` | ~1200 | High volume — one per temporal transition (see §6). |
| `ai_predictions` | ~120 | One or more per eligible requirement; pending/approved/rejected. |
| `calendar_events` | ~16 | Only user-created "meeting" events (hybrid approach) — per audit uncertainty. |

### 3.2 Secondary Tenants (Multi-Tenancy Exercise)

| Entity | Quantity |
|--------|----------|
| `organizations` | 2 |
| `users` | 4–6 per tenant |
| `organization_members` | all users of each tenant |
| `projects` | 2 per tenant |
| `teams` | 1–2 per tenant |
| `requirements` | ~6–8 per project |
| `sprints` | 2–3 per project |
| `tasks` | ~20 per project |

Governance, documents, notifications, activity logs, and AI predictions for secondary tenants scale proportionally (smaller). **Organizational isolation** must hold across all tenant-scoped tables (§4, §11).

### 3.3 Distribution Guidance

- **Roles:** per tenant roughly 1 ADMIN, 2–3 PROJECT_MANAGER, rest DEVELOPER. Secondary tenants fewer.
- **Departments:** Engineering, Product, Design, QA, DevOps, Finance, Management.
- **Requirement categories:** weighted toward `feature` (≈35%), `enhancement` (≈20%), `bug` (≈20%), `api` (≈8%), `uiux` (≈7%), others smaller, mirroring realistic backlogs.
- **Status mixes:** within a healthy active project, requirements statuses skew toward `inProgress`/`completed`; struggling/blocked projects skew toward `draft`/`blocked`/`pending`. Archetype tables (§5) drive these weights.
- **Priorities:** roughly 20% high, 50% medium, 30% low with archetype-specific skew.
- **Story points:** realistic Fibonacci-ish set {1, 2, 3, 5, 8, 13}; tasks split a requirement's points.

> **Rationale for scale:** ~400 tasks across sprints with per-task per-day temporal transitions yields thousands of snapshot rows (the true ML raw material) while staying small enough to load quickly and read clearly. Larger scale is a parameter, not a redesign.

---

## 4. Relationship Integrity Rules

Generated records must remain **relationally valid** at all times. These are hard constraints enforced by the generator and validators.

### 4.1 Ownership & Membership

- Every user may belong to **multiple organizations** (via `organization_members`), but each membership row references one org + one user.
- **All tenant-scoped tables** carry `organization_id` (where the final schema includes it): `projects`, `teams`, `invitations`, `activity_logs`, and — when created — `documents`, `folders`, and governance tables.
- `projects.organization_id` binds a project to exactly one org.
- `project_members` / `team_members` only reference users who are members of the same org as the project/team.
- A project's `manager_id` and a team's `lead_id` must reference a member of that project/team's org.

### 4.2 Parent–Child Chains

```
organization
 └── projects (1:N)
      ├── requirements (1:N)
      │    ├── dependency_id (self-ref, nullable, must be same project)
      │    └── ai_predictions (1:N)
      ├── sprints (1:N)
      │    └── tasks (1:N)  [tasks.sprint_id, tasks.project_id]
      ├── backlog (1:N via requirement_id, rank-ordered)
      ├── budget_line_items (1:N)
      ├── contracts (1:N)
      ├── approvals (1:N)
      ├── risks (1:N)
      ├── change_requests (1:N)
      ├── milestones (1:N)
      ├── folders (1:N, self-ref parent_id)
      └── documents (1:N, folder_id nullable, parent_version_id self-ref)
```

**Consistency rules:**

- `tasks.requirement_id` (when set) must reference a requirement of the **same project** as `tasks.project_id`.
- `tasks.sprint_id` (when set) must reference a sprint of the **same project** as `tasks.project_id`.
- `requirements.sprint_id` must reference a sprint of the **same project** as `requirements.project_id`.
- `backlog.requirement_id` unique (1:1) — one backlog entry per requirement; `backlog.project_id` matches the requirement's project.
- `ai_predictions.suggested_sprint_id` must reference a sprint of the same project as its requirement.
- `documents.folder_id` must reference a folder of the **same project**.
- `documents.parent_version_id` (version chain) must reference a document of the same project; only one `is_latest = true` per logical chain.

### 4.3 Display ID Uniqueness

- `requirements.display_id` (e.g. `REQ-001`) unique.
- `tasks.display_id` (e.g. `TASK-101`) unique.
- `change_requests.display_id` (e.g. `CR-001`) — per audit recommendation, **project-scoped** (format `CR-{project_code}-{seq}`) → unique per project.

### 4.4 Assignee / Owner Scoping

- `requirements.assignee_id`, `tasks.assignee_id`, `risks.owner_id`, `approvals.requester_id`/`decided_by`, `ai_predictions.approved_by` all reference users who are members of the relevant project's org (ideally project members).
- `notifications.user_id` references the recipient; authors of related entities can differ.

### 4.5 Referential Isolation (Anti-Duplication)

- **Governance `approvals`** are distinct from **`ai_predictions.recommendation_status`**. Do NOT create governance approval rows for AI recommendation approvals, and vice-versa.
- **`milestones`** are distinct from **SDLC timeline stages** (derived) and from **sprint boundaries**. Milestones are project-level marks.
- **Change requests** are distinct from **requirements** and from **approvals**.

---

## 5. Scenario Generation: Project Archetypes

Every project is assigned an **archetype** that drives probabilistic characteristics. Archetypes are applied to **both** the ongoing state and the historical/temporal trajectory (§6).

### Archetype Parameters

Each archetype defines probability weights/distributions for:

| Parameter | Meaning |
|-----------|---------|
| `velocity_mean`, `velocity_sd` | completed points per sprint |
| `completion_prob_per_day` | probability a working task advances a column per day |
| `block_prob` | probability task/req enters blocked state |
| `scope_creep_rate` | expected new/changed requirements per sprint |
| `rework_prob` | probability task returns from review/testing to inProgress |
| `requirement_status_weights` | distribution of requirement statuses |
| `risk_density`, `risk_severity_weights` | how many/how severe risks |
| `change_request_rate` | change requests per sprint |
| `overdue_prob` | probability tasks exceed sprint end |
| `overall_health` | derived monitoring health indication |

### 5.1 Archetype Catalog

#### A. Healthy Project
- Velocity stable ~team capacity; sprint commitments met.
- Low block rate (~10%), low scope creep, few severe risks, on-time task completion.
- Requirement statuses trend toward completed/inProgress.
- **Used by:** ~3 of 8 primary projects.

#### B. Struggling Project
- Below-capacity velocity, moderate delays, several open risks, some blocked tasks.
- Sprints frequently miss 20–40% of committed points; carry-over.
- **Used by:** ~2 projects.

#### C. Scope-Creep Project
- High `scope_creep_rate`; requirements/change requests added every sprint.
- Backlog grows; story points committed exceed capacity; requirements status stays draft/pending.
- **Used by:** ~1 project.

#### D. High-Performing Project
- Above-average velocity, near-zero rework/blocks, few risks, all milestones achieved on time.
- **Used by:** ~1 project.

#### E. Unstable / High-Risk Project
- High variance in velocity, very high block/overdue rates, many high-probability/high-impact risks, numerous change requests.
- Possibly blocked project status.
- **Used by:** ~1 project.

**Status assignment:** `project.status` (active/pending/completed/blocked) is assigned at generation time, with completed projects preferably high-performing or healthy (historical path fully resolved), blocked projects likely unstable.

### 5.2 Applying Archetypes Across Temporal Data

The archetype influences not just a static distribution but the **trajectory**: e.g., a struggling project's early sprints underdeliver, accumulating carry-over that compounds by later sprints. This produces the temporal correlation structure the ML dataset needs (§6, §9). Archetype is **not stored as a user-facing label** in the application tables (avoid hard-coding labels); it is a generator metadata tag recorded in the generation log, and it produces a natural outcome distribution rather than a hard label.

---

## 6. Temporal Data & Historical Snapshots

### 6.1 Why Snapshots Are Needed

Prediction problems (sprint delay, task delay) are about **future outcomes given current state**. To train on them, the dataset must contain many **"state at time T"** observations, each paired with a **future outcome known only later**. Storing only the final state loses this signal and risks training on outcome-contaminated features.

### 6.2 Generation Model

Each entity with a lifecycle evolves over a timeline. The generator builds, for every active/completed sprint, a **day-level evolution**:

```
Sprint "Sprint 4"
 ├── Day 1  (start): tasks in backlog/todo, totals, assignees, velocity_0
 ├── Day 2  : some tasks → inProgress; activity_logs recorded
 ├── Day 3  : tasks advance; a review task set to testing; rework events
 ├── Day 4  : ...
 ├── ...
 └── final  : resolved column_status per task, final completed_points
```

**Rules:**
- Task column transitions are drawn from archetype transition probabilities with **injected noise**.
- `sprints.completed_points` at the end equals the sum of points of tasks in `done` at that time (consistency, §6.3).
- Every state-changing transition emits an `activity_logs` row (action/e.g. `task_moved`, `task_completed`, `requirement_approved`, `risk_flagged`) at the correct timestamp. This both populates the realtime/activity UI and forms the **event stream** that ML feature engineering consumes.
- `users.last_active_at`, document `updated_at`, notification `created_at`, risk `updated_at`, etc. are all set consistently with the timeline.

### 6.3 Consistency Guarantees (Snapshots → Storage)

The **persisted application tables** store the **latest consistent state** plus (via `activity_logs`) the **event history**. Two acceptable modeling options — decided by the schema-finalization agent:

- **Option 1 (recommended):** Store only current state in domain tables; reconstruct history from `activity_logs`. Snapshot derivation happens in the ML pipeline.
- **Option 2:** Add time-series/audit tables (e.g., `task_snapshots`, `sprint_snapshots`) storing day-level states explicitly.

> **⚠ UNCERTAINTY (U-02):** Whether to add explicit snapshot tables depends on the final schema. This spec works under **Option 1** (derive from `activity_logs`) as the default and requires the ML pipeline to reconstruct state from logs. Explicit snapshot tables can be layered later without redesign.

**Invariants at any snapshot T:**
- `completed_points = SUM(points of tasks in done at T)`.
- `column counts` consistent with task states at T.
- All `activity_logs` timestamps are non-decreasing and within their parent sprint's date range (unless the sprint is delayed — see delay handling below).
- No future-dated events at time-of-observation snapshots.

### 6.4 Preventing Data Leakage

The snapshot design is the primary **anti-leakage** mechanism:

1. **No lookahead in features.** A prediction made at day T uses only features computed from state ≤ T (task states, sprint totals/net velocity before T, pending work, historical velocity). Future outcomes (whether the task/sprint is delayed) are **not** available at T.
2. **Temporal train/test split.** The ML pipeline must split on time (e.g., train on sprints/projects before a cutoff date, evaluate after), never random-split across the timeline, which would leak future info.
3. **Outcome recorded after horizon.** Ground truth is captured at `T + horizon`, clearly separated in time from the feature snapshot.
4. **No archetype label leakage into features.** Features must be derived from observed domain data, not from the generator's internal archetype tag. The archetype is for dataset diversity, not a modeling feature.

---

## 7. Ground Truth Generation

Ground truth for ML must be generated by the same temporal simulation that produces the features — **not hand-labeled**.

### 7.1 Approach

- Each entity's eventual outcome (e.g., "task finished on time", "sprint delayed", "requirement became blocked") **emerges** from the archetype's probabilistic transition model + noise, rather than being pre-assigned.
- For each candidate prediction problem (§9), the outcome is the **observed** value at the end of the relevant window (e.g., actual completion day vs. planned day; final status).
- **Noise** (Gaussian on durations, Bernoulli on transitions, jitter on timestamps) guarantees realistic variance so the data is non-degenerate and correlations are imperfect — essential for meaningful model evaluation.

### 7.2 Realistic Correlations Without Deterministic Labels

- Correlations arise **organically**: high `complexity`/`story_points` requirements probabilistically take longer → more likely to be delayed; an unstable archetype with high block probability → more task delays and more open risks. These are emergent, not explicitly encoded per-row.
- **Injected noise** keeps the relationship stochastic so no feature perfectly predicts the target (avoids a degenerate "too easy" dataset and hides the archetype).

---

## 8. LLM vs. Deterministic Field Split

The system must split generation into **LLM-produced semantic content** (expensive, non-structural) and **deterministic structural fields** (cheap, must be exact).

### 8.1 Fields Generated by an LLM

| Entity | LLM Fields |
|--------|-----------|
| projects | `description`, `name` (human-sounding, distinct per archetype) |
| requirements | `title`, `description`, `acceptance_criteria` (where schema supports), category-specific phrasing |
| tasks | `title`, `description` (if present in final schema) |
| risks | `title`, `mitigation` |
| change_requests | `title`, `description` |
| contracts | `name`, vendor name (semantic flavor) |
| approvals | `title`, `notes` |
| activities | grapheme-level `action`/`value` messages (e.g. "Updated REQ-003 status to reviewed by Alice") |
| notifications | `title`, `description`, `action_label` |
| goals | `sprints.goal` |

LLM output is **non-deterministic by design** but seeded per-row so regeneration is stable (a stable RNG seed + cached generation).

### 8.2 Fields That MUST Be Deterministic

| Category | Fields / Rules |
|----------|----------------|
| IDs | All primary/foreign keys, `display_id` (`REQ-...`, `TASK-...`, `CR-...`) |
| Foreign keys | Every `*_id` reference (§4) |
| Timestamps | `created_at`, `updated_at`, transition times, snapshot times — all deterministic from schedule |
| Relationships | Membership, ownership, parent–child chains |
| Calculated metrics | `projects.progress`, `sprints.total_points`/`completed_points`, points math, budget `remaining`/`variance` (derive, don't store where flagged) |
| Status consistency | enum values coherent with evolution path & derived statuses (e.g., milestone display status, risk severity, budget status) |
| Labels | No hard-coded ML labels in domain tables; archetype stays in generation metadata |

These fields are **computed by code**, never left to the LLM, so structural integrity is guaranteed before validation.

---

## 9. ML Dataset Design

### 9.1 Pipeline

```
application database (Postgres)
        ↓  export of activity_logs + current state
historical snapshots (reconstructed at day granularity)
        ↓  feature engineering (per prediction problem)
ML dataset (CSV/Parquet, immutable, versioned)
        ↓  splits
training / evaluation / (future) serving
```

### 9.2 Candidate Prediction Problems

For each: features, target, horizon, ground truth, leakage risks, minimum useful history.

#### P1 — Sprint Delay
- **Features:** planned vs. committed points; historical velocity (mean/sd of last N completed sprints); current sprint week-fraction elapsed; points completed so far; ratio of blocked tasks; carry-over from previous sprints; team size; number of high-priority requirements; scope additions this sprint.
- **Target:** binary/regression — sprint delivers < X% committed points by planned end, or (regression) delay in days.
- **Horizon:** evaluated at sprint midpoint / end.
- **Ground truth:** actual final completion vs. plan.
- **Leakage:** do not include final `completed_points` or future-day states as features for a mid-sprint prediction.
- **Min. useful history:** ≥ 3–4 completed sprints prior to the prediction point for a stable velocity baseline → favors projects with ≥ 4 completed sprints.

#### P2 — Task Delay
- **Target:** whether a task finishes after its planned completion (or per-day status: delayed ≥ N days).
- **Features:** task `points`/complexity, priority, assignee, day-in-sprint, column transitions so far, dependency presence/completion, requirement link, sprint load, per-task remaining-work estimates.
- **Horizon:** task planned end; outcome measured at actual completion.
- **Ground truth:** observed completion day.
- **Leakage:** no use of final column_status for pre-completion state; no future events.
- **Min. useful history:** a completed sprint's task set per project.

#### P3 — Workload Overload
- **Target:** a user is overloaded (exceeds capacity) at a future point / point-in-time overload flag.
- **Features:** assigned open points per user, in-progress count, historical completion rate, capacity, number of projects/sprints, priority distribution, upcoming commitments.
- **Horizon:** next sprint planning point.
- **Ground truth:** observed overload via completed vs. assigned workload over the window.
- **Leakage:** exclude post-window assignments/completions.
- **Min. useful history:** ~2–3 sprints of per-user workload history.

#### P4 — Requirement Risk
- **Target:** a requirement becomes blocked / slips / is not completed as planned.
- **Features:** category, business_value, complexity, story_points, dependency presence/completion, estimated_effort, status/age, assignee load, sprint load, prior requirement outcomes.
- **Horizon:** requirement due date or end of assigned sprint.
- **Ground truth:** observed final requirement status.
- **Leakage:** no future status/dependency completion before evaluation.
- **Min. useful history:** ≥ 5–10 requirements per project across a few sprints.

#### P5 — Project Risk
- **Target:** project health declines / budget overrun / timeline slippage within a future window.
- **Features:** project-level aggregates — velocity trend, open risk count/severity, scope creep (req/CR rate), budget spent ratio, milestone attainment, member churn.
- **Horizon:** next month / next N sprints.
- **Ground truth:** observed future health/budget/timeline outcome.
- **Leakage:** exclude future-period risk/milestone data as features.
- **Min. useful history:** ≥ 2–3 months of project history (several sprints) → needs longer-lived projects in the seed set.

### 9.3 Leakage Controls (Across All Problems)

- Temporal split; features computed strictly as-of prediction time.
- Ground truth captured at a strictly later timestamp.
- No generator archetype label used as a feature.
- Leakage checked programmatically by a validator (§11) that asserts no feature column references data created after the label timestamp.

---

## 10. Dataset Formats

| Format | Use | Rationale |
|--------|-----|-----------|
| **JSON** | Seed **input** descriptor (intermediate), SQL upsert source | Human-readable, expressive for nested/relational config and LLM prompts |
| **CSV / Parquet** | **ML datasets** (one file per prediction problem, as-of features + labels) | Columnar, efficient, versionable; Parquet preferred for large snapshot counts |
| **SQL** | Only the final **insert/upsert** into Supabase (generated from JSON via the pipeline) | Keeps generation logic in code; SQL is the delivery mechanism, not the authoring format |

**Workflow:** deterministic generator + LLM → normalized JSON graph → validated → rendered to SQL → loaded into Supabase. ML pipeline derives snapshot tables → CSV/Parquet.

---

## 11. Validation Requirements

A validation stage runs after generation (and can run as a CI check) enforcing:

| Category | Checks |
|----------|--------|
| **Schema validity** | Every target table/column exists in the finalized schema; types match (uuid, date, numeric, enum). |
| **FK integrity** | Every `*_id` reference resolves to an existing row; no orphaned references. |
| **Enum validity** | All status/type/priority values are members of the schema enums. |
| **Temporal consistency** | `created_at ≤ updated_at`; activity timestamps within parent ranges; no future-dated events at snapshot time; sprint start ≤ end. |
| **Status consistency** | `sprints.completed_points == SUM(done task points)`; milestone display status matches `completed`+`target_date`; risk severity matches probability×impact; project.progress reflects derived progress; points arithmetic balanced. |
| **Organization isolation** | No tenant-scoped row references a foreign entity belonging to a different org; cross-tenant FK violations fail. |
| **Realistic distributions** | Feature-level checks: status/priority/category/role proportions within tolerance bands per archetype; no degenerate single-value columns; non-trivial variance. |
| **Duplicate detection** | No duplicate `display_id`, email, code, membership PK, or logical-document `is_latest` collisions. |
| **Missing values** | Nullability expectations enforced; allowed nulls (e.g. nullable FKs) within acceptable rate; no unexpected nulls on NOT NULL columns. |
| **ML leakage** | Feature columns never reference data with timestamp > label timestamp; temporal split sanity checked. |

Each check reports a pass/fail with a count; failures abort publication of the dataset unless explicitly tolerated and logged.

---

## 12. Complete Proposed Generation Pipeline

### Stage 0 — Schema Introspection
- Read the finalized `supabase/schema.ts`/migrations; build an entity/column/enum model.
- Abort on references to tables that do not exist (honors U-01).

### Stage 1 — Topology & Identities (Deterministic)
- Generate orgs, users, memberships, roles, teams, team_members.
- Generate projects: assign archetype, status, manager, org, dates, budget totals, milestones.
- Assign project_members per archetype team sizes.

### Stage 2 — Work Plan (Deterministic)
- Per project, generate backlog: requirements (with deterministic `display_id`, category, points, scoring fields) at archetype-weighted distribution.
- Build sprints with dates and initial `total_points` commits; assign requirements/tasks to sprints.
- Generate tasks (deterministic points, priority, assignee, project/sprint/requirement links).

### Stage 3 — Temporal Simulation (Deterministic core + probabilistic transitions)
- Walk each sprint day by day; apply archetype transition probabilities + noise to advance task columns, record activity_logs, update points/progress.
- Apply scope creep (add requirements/change-requests), risk events, rework, blocks probabilistically.
- Emit approvals, notifications, risks, contracts, budget events consistent with the timeline.
- Produce a full day-level event stream (the snapshot source).

### Stage 4 — Semantic Content (LLM)
- Generate LLM fields (§8.1) for projects/requirements/tasks/risks/CRs/contracts/approvals/activities/notifications/goals using seeded, cached prompts.
- Keep deterministic fields untouched; the LLM receives structured schemas and cannot change FKs, IDs, dates, or statuses.

### Stage 5 — Records Assembly
- Derive current-state rows (e.g., final `sprints.completed_points`, `projects.progress`, column_status) from the simulation.
- Assign display IDs, final timestamps, resolved statuses, budget remaining, milestone status.
- Assemble documents/folders, user_preferences, secondary tenants.

### Stage 6 — Validation
- Run all §11 checks; produce a validation report (JSON).
- Fix-and-rerun or abort on critical failures.

### Stage 7 — Publication
- Render to SQL upsert statements; load into Supabase (a separate seed-application step, out of this document's scope to execute).
- Optionally emit ML snapshot tables to CSV/Parquet for the future pipeline.

### Generation Log
- Record archetype per project, seeded PRNG state, LLM prompts/versions, and validation results to an audit log for reproducibility.

---

## 13. Uncertainty Register

| ID | Topic | Uncertainty | Recommendation |
|----|-------|-------------|----------------|
| U-01 | Final schema | The exact final tables/columns/enums are not yet finalized. | Generator introspects the finalized schema at runtime; targets the "KEEP"/high-priority tables from the parallel audits. |
| U-02 | Snapshot storage | Whether to add explicit `*_snapshots` tables or derive from `activity_logs`. | Default: derive from `activity_logs` (Option 1); add explicit tables later if needed. |
| U-03 | Calendar events | Scope of `calendar_events` (store only meetings vs. all events). | Follow audit hybrid recommendation: derive sprint/milestone events; store only user-created/meeting events. |
| U-04 | Task `progress` | Store vs. derive from `column_status`. | Derive from column status unless final schema stores it; generate consistent if stored. |
| U-05 | Document versioning | Semantic (v1.2) vs. integer (v1, v2). | Use integer versioning; generate `is_latest` chain consistently. |
| U-06 | Secondary tenants | Whether separate orgs should be large (production-like) or small. | Keep small; enough to validate isolation, not to inflate seed size. |
| U-07 | Per-project roles | Project-level role override in `project_members.role`. | If present in final schema, assign project-level roles consistent with org roles. |
| U-08 | Seed scale | Exact counts are suggestions; ML quality improves with more history. | Quantities are configurable parameters; defaults tuned to frontend coverage + ML minimum-history needs. |

---

## Summary

This specification defines a **hybrid, deterministic-first generation system** that:

- **Populates** every frozen-frontend page across all statuses and roles while respecting the relational model and multi-tenancy.
- Provides a **temporal, snapshot-capable** foundation (from `activity_logs`) that **prevents leakage** and supports **five candidate ML prediction problems** with defined features, targets, horizons, and ground truth.
- Separates **LLM semantic content** from **deterministic structural fields**.
- Defines **realistic quantities**, **project archetypes**, **probabilistic ground truth**, and **comprehensive validation**.
- Delivers via a **JSON → SQL** seed pipeline and **CSV/Parquet** ML datasets, with all uncertainties explicitly flagged.
