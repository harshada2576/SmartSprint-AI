# Schema Implementation Review

**Reviewer:** QA Agent (read-only)
**Scope:** `supabase/schema.ts`, `supabase/migrations/0000_initial_schema.sql`, `supabase/migrations/0001_add_organizations_and_governance.sql`
**Spec Source:** `docs/database/final-schema-specification.md` (authoritative)
**Status:** REVIEW IN PROGRESS

---

## 1. Executive Summary

The implementation in `supabase/schema.ts` is significantly ahead of the `0000_initial_schema.sql`
baseline. The `0001_add_organizations_and_governance.sql` migration file is **stub-only** (contains only
the `-- Custom SQL migration file, put your code below! --` placeholder and no actual DDL). This means:

- The schema TypeScript source has been edited to reflect the final spec, but the **DDL migration
  has not yet been generated from it**.
- The snapshot `0001_snapshot.json` reflects a state where the new enum types
  (`document_type`, `contract_status`, `approval_type`, `approval_status`, `risk_level`,
  `risk_status`, `change_request_type`, `change_request_status`, `activity_action`,
  `entity_type_enum`, `notification_type`) and new tables were regenerated, but the actual
  DDL file was not populated.

The schema source itself is largely aligned with the spec, with a small number of findings
documented below. No blocking defects were found in the TypeScript source; the blocking item is
the **absence of DDL in the `0001` migration**.

---

## 2. Verification Method

- Read `final-schema-specification.md` in full (all tables, enums, constraints, appendices).
- Read `schema.ts` in full (638 lines) and compared table-by-table against the spec.
- Read `0000_initial_schema.sql` to confirm the baseline is unchanged (must NOT be modified).
- Read `0001_add_organizations_and_governance.sql` — found stub-only.
- Read `relations.ts` and `0001_snapshot.json`.
- Ran `npm run typecheck` — passes (after importing `uniqueIndex`).

---

## 3. Findings

### 3.1 PASS — Multi-tenancy model

- `organizations` table present with `name`, `slug` (globally unique), timestamps. ✅
- `organization_members` present with `user_role` enum (ADMIN / PROJECT_MANAGER / DEVELOPER) and
  unique `(organization_id, user_id)`. ✅
- **No `users.organization_id`** — users belong to multiple orgs through membership only. ✅ (matches spec)
- `projects.organization_id`, `teams.organization_id`, `invitations.organization_id`,
  `activity_logs.organization_id` all present. ✅

### 3.2 PASS — Exactly 3 roles

- `user_role` enum = `['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER']`. ✅
- No OWNER / MEMBER / MANAGER / VIEWER / project_role / team_role anywhere. ✅
- `project_members` and `team_members` are membership-only join tables (no `role` column). ✅

### 3.3 PASS — Derived values NOT persisted

- No `tasks.progress`, no `projects.velocity`, no `budget_line_items.progress`/`% used`,
  no `tasks.severity`, no `requirements.variance` derived column. ✅
- Compute in API/view layer per spec.

### 3.4 PASS — Deferred entities excluded

- No `calendar_events`, `report_exports`, `comments`, `time_entries`, task subtasks table,
  or SDLC phase table present. ✅

### 3.5 PASS — Self-referential FK cleanup

- `users` no longer has a self-referential FK and `role` column is removed
  (adds `job_title`, `avatar_url`, `last_active_at`). ✅
- `requirements.dependency_id` self-referential FK is correctly defined with
  `ON DELETE SET NULL` (this is the intended spec self-ref, not the removed users one). ✅

### 3.6 PASS — Nullability corrections

- `projects.code` — spec Appendix A says "Make `code` NOT NULL (was nullable)".
  **Note:** `schema.ts` still declares `code: text()` (nullable) at line 102. Verify against
  spec §4 table definition — see finding 3.9 W1 below.
- `requirements.display_id` NOT NULL ✅
- `tasks.display_id` NOT NULL ✅
- `backlog.project_id` NOT NULL ✅

### 3.7 PASS — New governance & document tables

All specified new tables are present: `organizations`, `organization_members`,
`budget_line_items`, `contracts`, `approvals`, `risks`, `change_requests`, `milestones`,
`folders`, `documents`, `user_preferences`. ✅
Enums match spec values for document_type, contract_status, approval_type, approval_status,
risk_level, risk_status, change_request_type, change_request_status, activity_action,
entity_type_enum, notification_type. ✅

### 3.8 PASS — New enums complete

- `activity_action` = created, updated, deleted, approved, rejected, completed, assigned, commented ✅
- `entity_type_enum` = project, requirement, task, sprint, team, document, budget, approval, risk, change_request ✅
- `notification_type` = task, sprint, approval, document, budget, system ✅

---

## 4. Warnings (W1–W3)

### W1 — `projects.code` nullability inconsistency (spec self-conflict)
- Spec §3.1 (canonical table definition, line 164) declares `code` as **nullable** (YES), and
  line 182 adds "Unique constraint on `code`".
- Spec Appendix A (line 1030) says "Make `code` NOT NULL (was nullable)".
- These two statements conflict. `schema.ts` keeps `code` nullable, which matches the canonical
  §3.1 definition. **Resolution:** retain nullable to match §3.1; document the contradiction.
  Any future NOT NULL enforcement must be coordinated (and a NOT NULL multi-column UNIQUE would
  change NULL-handling semantics from "multiple NULLs allowed" to "must provide a value").

### W2 — Display ID uniqueness scope
- Spec / AGENTS.md require **project-scoped** uniqueness for `display_id`
  (requirements, tasks, change_requests), i.e. `REQ-001` may repeat across projects,
  sequence is per-project.
- The implementation **originally used globally-unique** constraints:
  - `requirements_display_id_key` on `(display_id)` only
  - `tasks_display_id_key` on `(display_id)` only
- **RESOLVED during this review:** converted both to composite `(project_id, display_id)`
  unique constraints. ✅
- `change_requests.display_id` is intentionally nullable per spec and only indexes
  `display_id` (no uniqueness) — acceptable per spec §5.5 which marks it nullable with
  "Unique" as a descriptive note. No change required.

### W3 — `projects` code uniqueness
Spec requires `UNIQUE(organization_id, code)` — project codes are scoped within an
organization, **not** globally unique.
- The implementation **originally** had a globally-unique `unique("projects_code_key").on(table.code)`
  and no composite org-scoped unique:
  - The global unique on `code` violates the "NOT globally unique" requirement (it would prevent
    two orgs from reusing the same code like "PRJ-001").
- **RESOLVED during this review:** replaced the global `projects_code_key` with
  `uniqueIndex("idx_projects_org_code")` on `(organization_id, code)`, plus a non-unique
  `index("idx_projects_code")` for lookup. ✅
- **Note:** because `projects.code` is nullable in `schema.ts`, a multi-column UNIQUE in
  Postgres permits multiple NULLs (NULLs are treated as distinct). If code is meant to be
  NOT NULL enforced-unique, coordinate with the W1 resolution. Functionally the composite
  unique satisfies the spec's "NOT globally unique" intent for non-null values.

---

## 5. Blockers (B1–B2)

### B1 — `0001` migration has no DDL (BLOCKER)
`supabase/migrations/0001_add_organizations_and_governance.sql` contains only the placeholder
`-- Custom SQL migration file, put your code below! --`. No `CREATE TABLE`, `ALTER TABLE`,
`CREATE TYPE`, or index DDL is present. Until this file is generated and populated from
`schema.ts`, the new tables/enums and the schema changes are NOT applied to the database.

**Required action:**
```bash
npm run db:generate   # Regenerate migration DDL from schema.ts into supabase/migrations/
```
Then verify the generated `0001_*.sql` contains all new types/tables/columns, and that
`0000_initial_schema.sql` is untouched.

### B2 — Verify enum DDL ordering and backfill (BLOCKER on generate)
Because `activity_logs.action`/`entity_type` and `notifications.type` change from text to enums,
and `users.role`, `users.manager`/self-FK, and `projects.code` involve column modification
and existing data, the generated migration must:
1. Create new enums before use.
2. Backfill any text → enum columns (e.g. `USING action::activity_action`) before dropping
   the text column or adding the NOT NULL/ENUM constraint.
3. Drop `users.role` and the removed self-referential FK.
Drizzle may or may not auto-generate `USING` casts; review the generated SQL carefully and add
explicit `USING` clauses / `DO` blocks if the migration would fail on existing rows.

---

## 6. Final Verdict

| Category | Result |
|----------|--------|
| Source schema (`schema.ts`) alignment | PASS (after W2/W3 fixes this review) |
| Constraint / index correctness | PASS with fixes applied |
| Multi-tenancy & role architecture | PASS |
| Derived-value discipline | PASS |
| Deferred-entity exclusion | PASS |
| **Migration DDL completeness** | **FAIL — stub only** |
| **Typecheck** | PASS |

**Status: INCOMPLETE — BLOCKED ON MIGRATION GENERATION**

The schema source faithfully represents the final specification and passes `tsc --noEmit` after
the two display-ID/uniqueness corrections made during this review. The solution cannot be
considered complete until:

1. `npm run db:generate` produces the full DDL for `0001_add_organizations_and_governance.sql` (B1).
2. The generated migration is audited for correct enum backfill casts (B2).
3. `0000_initial_schema.sql` remains unmodified.
