# RLS Security Foundation — SmartSprint AI

Implementation record for the production-grade Supabase/PostgreSQL Row Level
Security layer. The normative source of truth is the migration itself:

- `supabase/migrations/0002_rls_security_foundation.sql`

Generated: 2026-09-09
Status: IMPLEMENTED (migration authored, statically validated; live-DB
application pending — see §8).

Prior design inputs (not modified): `docs/database/auth-rls-architecture.md`,
`docs/database/auth-rls-test-plan.md`,
`docs/database/final-schema-specification.md`.

---

## 1. Files changed

| File | Change |
|------|--------|
| `supabase/migrations/0002_rls_security_foundation.sql` | **Added.** Dedicated, deterministic, idempotent RLS migration: 12 helper functions, `ENABLE ROW LEVEL SECURITY` on 24 tables, 111 policies, 5 integrity trigger functions + 18 triggers. |
| `docs/database/rls-security-foundation.md` | **Added.** This document. |
| `supabase/schema.ts` | **Not changed.** Drizzle does not model RLS; no security-related DDL belongs there. |
| Seed data (`seed/*.json`) | **Not changed.** Verified compatible (see §8). |
| Frontend / `src/**` / `ai/**` / `tests/**` | **Not touched** (out of scope for this agent). |

---

## 2. RLS tables enabled

All 24 user-accessible application tables (every table in `supabase/schema.ts`):

`activity_logs`, `ai_predictions`, `approvals`, `backlog`,
`budget_line_items`, `change_requests`, `contracts`, `documents`, `folders`,
`invitations`, `milestones`, `notifications`, `organization_members`,
`organizations`, `project_members`, `projects`, `requirements`, `risks`,
`sprints`, `tasks`, `team_members`, `teams`, `user_preferences`, `users`.

`ENABLE ROW LEVEL SECURITY` (not `FORCE`), so the table owner and
`BYPASSRLS` roles (`postgres`, `service_role`) keep working for the trusted
server lane while `anon`/`authenticated` callers are filtered by policy.

---

## 3. Policies added, grouped by table (111 total)

Naming: `{table}_{select|insert|update|delete}_{member|staff|admin|self|own}`.
`member` = org/project membership floor, `staff` = ADMIN or PROJECT_MANAGER of
the owning org, `admin` = ADMIN only, `self`/`own` = `auth.uid()`-scoped.

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `organizations` | `organizations_select_member` (member orgs only) | — (trusted lane) | `organizations_admin_update` | — (trusted lane) |
| `organization_members` | `organization_members_select_member` | `organization_members_admin_insert` | `organization_members_admin_update` | `organization_members_admin_delete` |
| `users` | `users_select_self`, `users_select_org_directory` (shared-org only) | `users_insert_self` (`id = auth.uid()`) | `users_update_self`, `users_update_admin` | — (via `auth.users` cascade / trusted lane) |
| `teams` | `teams_select_org_member` (staff: all org teams; developers: member teams only via `team_members` + `auth.uid()`) | `teams_admin_insert` (lead must be org member) | `teams_admin_update` | `teams_admin_delete` |
| `team_members` | `team_members_select_org_member` | `team_members_admin_insert` (added user must be org member) | — (no payload) | `team_members_admin_delete` |
| `projects` | `projects_select_org_staff` (ADMIN/PM all-in-org), `projects_select_member` (DEV: member projects only) | `projects_insert_staff` | `projects_update_staff` | `projects_delete_admin` |
| `project_members` | `project_members_select_org_member` | `project_members_admin_insert` (no self-enrollment) | — | `project_members_admin_delete` |
| `sprints` | `sprints_select_staff`, `sprints_select_member` | `sprints_insert_staff` (PM+) | `sprints_update_staff` (DEV: no planning writes) | `sprints_delete_admin` |
| `requirements` | `requirements_select_staff`, `requirements_select_member` | `requirements_insert_staff` (same-project sprint/dependency, member assignee) | `requirements_update_staff`, `requirements_update_dev_self` (own-assigned only, see §7) | `requirements_delete_admin` |
| `backlog` | `backlog_select_staff`, `backlog_select_member` | `backlog_insert_staff` (requirement same-project) | `backlog_update_staff` (DEV read-only) | `backlog_delete_admin` |
| `tasks` | `tasks_select_staff`, `tasks_select_member` | `tasks_insert_staff` (no DEV create) | `tasks_update_staff`, `tasks_update_dev_self` (see §7) | `tasks_delete_admin` |
| `ai_predictions` | `ai_predictions_select_staff`, `ai_predictions_select_member` (via requirement chain) | — (trusted AI lane) | `ai_predictions_update_staff` (approve, `approved_by = self`) | `ai_predictions_delete_admin` |
| `activity_logs` | `activity_logs_select_member` (org / member-project / staff / own) | — (append-only, trusted lane) | — | — |
| `notifications` | `notifications_select_own` | — (system-generated) | `notifications_update_own` (mark read, `user_id` pinned) | `notifications_delete_own` |
| `user_preferences` | `user_preferences_select_own` | `user_preferences_insert_own` | `user_preferences_update_own` | `user_preferences_delete_own` |
| `invitations` | `invitations_select_staff` (ADMIN+PM read; DEV none) | `invitations_admin_insert` | `invitations_admin_update` | `invitations_admin_delete` |
| `budget_line_items` | `budget_line_items_select_staff`, `budget_line_items_select_member` | `budget_line_items_admin_insert` | `budget_line_items_admin_update` (PM denied) | `budget_line_items_admin_delete` |
| `contracts` | `contracts_select_staff`, `contracts_select_member` | `contracts_insert_staff` | `contracts_update_staff` | `contracts_delete_admin` |
| `approvals` | `approvals_select_staff`, `approvals_select_member` | `approvals_insert_member`, `approvals_insert_staff` (requester=self, pending, undecided) | `approvals_update_staff` (decider=self, no self-approval) | `approvals_delete_admin` |
| `risks` | `risks_select_staff`, `risks_select_member` | `risks_insert_member`, `risks_insert_staff` (DEV may file) | `risks_update_staff` (DEV create-only) | `risks_delete_admin` |
| `change_requests` | `change_requests_select_staff`, `change_requests_select_member` | `change_requests_insert_member`, `change_requests_insert_staff` | `change_requests_update_staff` (staff-only; no self-decision: `status='pending'` or `requester_id IS DISTINCT FROM auth.uid()`, approvals-parity) | `change_requests_delete_admin` |
| `milestones` | `milestones_select_staff`, `milestones_select_member` | `milestones_insert_staff` (DEV read-only) | `milestones_update_staff` | `milestones_delete_admin` |
| `folders` | `folders_select_staff`, `folders_select_member` | `folders_insert_staff`, `folders_insert_member` (`created_by = self`, parent same-project) | `folders_update_staff`, `folders_update_dev_own` (own only) | `folders_delete_admin` |
| `documents` | `documents_select_staff`, `documents_select_member` | `documents_insert_staff`, `documents_insert_member` (`owner = self`, folder same-project) | `documents_update_staff`, `documents_update_dev_own` (own only) | `documents_delete_admin` |

Uniform DELETE posture: business-table deletes are ADMIN-only (least
privilege; PM deletes go through the trusted lane with audit). User-scoped
tables allow own-row deletes; audit/AI/invite creation paths are server-only.

---

## 4. Helper functions added

All `STABLE ... SECURITY DEFINER SET search_path = public`, verdict-only
(boolean/uuid derived from `auth.uid()`; never raw rows):

| Function | Purpose |
|----------|---------|
| `smartsprint_is_org_member(org)` | Caller holds any membership in org (org-isolation floor). |
| `smartsprint_is_org_admin(org)` | Caller is ADMIN in org (org-scoped, never global). |
| `smartsprint_is_org_staff(org)` | Caller is ADMIN or PROJECT_MANAGER in org (operational writes). |
| `smartsprint_user_is_org_member(user, org)` | Arbitrary user is member of org (FK-smuggling guard for assignee/owner/manager/lead). |
| `smartsprint_shares_org_with(user)` | Caller shares ≥1 org with user (org-gated users directory). |
| `smartsprint_is_user_org_admin(user)` | Caller is ADMIN in an org containing user (profile maintenance only; roles remain locked in `organization_members` policies). |
| `smartsprint_project_org(project)` | Owning org of a project (NULL → fail-closed). |
| `smartsprint_team_org(team)` | Owning org of a team. |
| `smartsprint_sprint_project(sprint)` | Owning project of a sprint (same-project guard). |
| `smartsprint_requirement_project(req)` | Owning project of a requirement. |
| `smartsprint_folder_project(folder)` | Owning project of a folder. |
| `smartsprint_is_project_member(project)` | Caller holds a `project_members` row (DEV project isolation). |

Why `SECURITY DEFINER`: policies on `organization_members` must test
membership without recursing into `organization_members` RLS (infinite
recursion otherwise); project-derived policies resolve org ownership without
nesting RLS evaluations. Documented per-function via `COMMENT ON FUNCTION`.

---

## 5. Role / permission model implemented

Exactly three roles from the existing `user_role` enum; no new roles.
Effective role = `organization_members.role` **in the organization that owns
the target row** (verified per-request; the seed fixture `462fd273…`, ADMIN in
Org A but DEVELOPER in Org B, is handled correctly).

- **ADMIN** — org governance: org settings update, full membership
  management (insert/update/delete, incl. promotions), teams/projects CRUD,
  all operational writes, all governance writes (incl. budgets), invitation
  management, AI approval, document/folder delete. Cannot touch foreign orgs;
  cannot remove/demote the last ADMIN (trigger, §6).
- **PROJECT_MANAGER** — operational writes in authorized orgs/projects:
  projects/sprints/requirements/backlog/tasks create-update, contracts,
  approvals/risks/change-requests/milestones/files management, AI approval,
  invitation visibility (read). Cannot manage memberships/roles, teams,
  budgets, deletes, or decide-own-requests.
- **DEVELOPER** — member-project reads; task/requirement updates **only on
  rows assigned to self and staying assigned to self** (§7); may file
  approvals/risks/change-requests and upload own docs/folders in member
  projects; may update own folders/documents only. No creation of tasks,
  no reassignment, no planning writes, no governance decisions, no deletes,
  no membership/invitation/budget access.

Non-members (including `anon` / `auth.uid() IS NULL`): deny everywhere except
own `users` self-row/own preferences after profile creation (fail-closed).

---

## 6. Cross-organization protections

1. **Org-membership floor on every read/write**: all org/project-derived
   policies require `smartsprint_is_org_member` (directly or via
   project→org composition). Cross-org SELECT returns zero rows; cross-org
   INSERT/UPDATE/DELETE raise RLS violations.
2. **Referenced-user confinement**: every assignee/owner/manager/lead/write
   path carries `(… IS NULL OR smartsprint_user_is_org_member(ref, org))`,
   so Org A rows cannot point at Org B-only users (no oracle, no leakage).
3. **Same-project FK consistency in `WITH CHECK`**: `tasks.sprint_id` /
   `tasks.requirement_id`, `requirements.sprint_id` / `dependency_id`,
   `backlog.requirement_id`, `documents.folder_id`, `folders.parent_id`,
   `ai_predictions.suggested_sprint_id` must resolve to the row's own
   project (or its requirement's project). A legal `project_id` cannot launder
   a foreign-org linked row.
4. **Triggers (apply to every role, including the privileged pool)**:
   - `smartsprint_forbid_organization_change` — `organization_id` immutable
     on `projects`, `teams`, `invitations`.
   - `smartsprint_forbid_cross_org_project_move` — `project_id` may never
     cross org boundaries via UPDATE on all 12 project-child tables (closes
     the dual-membership hole where a member of orgs A+B moves A-data into a
     B project where B members could read it; RLS alone cannot compare old
     vs new rows).
   - `smartsprint_ai_prediction_guard` — requirement moves stay in-org;
     suggested sprints stay same-project (also guards the trusted AI lane).
   - `smartsprint_protect_organization_members` — membership keys immutable;
     the last ADMIN of an org can never be deleted or demoted.
   - `smartsprint_forbid_user_id_change` — `users.id` immutable (no
     impersonation via PK rewrite).

---

## 7. Developer task protections

`tasks_update_dev_self` (and the mirrored `requirements_update_dev_self`,
`folders_update_dev_own`, `documents_update_dev_own`):

- `USING`/`WITH CHECK` both require `assignee_id = auth.uid()` (tasks,
  requirements) / `owner_id`/`created_by = auth.uid()` (docs/folders) —
  peer tasks, unassigned-pool tasks, and reassignment in either direction
  (give-away or claim) are denied.
- Both clauses require project membership + org membership of the row's
  project — unassigned tasks and non-member projects are not writable.
- `WITH CHECK` re-validates same-project sprint/requirement/folder linkage —
  scope-linkage tampering (changing `project_id`/`sprint_id`/
  `requirement_id`/`folder_id` to escape scope) is denied.
- No DEVELOPER INSERT on tasks/requirements and no DEVELOPER DELETE
  anywhere — work is assigned by ADMIN/PM; developers cannot self-grant.
- Cross-org exfiltration via UPDATE-moving a row between two authorized
  projects in different orgs is blocked by the §6 project-move trigger.

---

## 8. Validation performed

1. **Seed compatibility (static, full dataset)**: all `seed/*.json` FKs
   resolve; same-project chains hold with **0 mismatches**
   (`tasks.sprint_id`/`requirement_id`, `requirements.sprint_id`/
   `dependency_id`, `backlog.requirement_id`, `documents.folder_id`,
   `folders.parent_id`, `ai_predictions.suggested_sprint_id`); all
   assignees/owners/managers/leads/approvers and all
   `project_members`/`team_members` reference same-org members; the
   multi-org/multi-role fixtures (incl. ADMIN-in-A/DEVELOPER-in-B and the
   triple-org member) are preserved. Triggers added here are consistent
   with the seed (no seed change required).
2. **SQL validity**: migration parses as valid PostgreSQL (libpg_query grammar
   v17): 316 statements — 17 `CREATE FUNCTION`, 24 `ALTER TABLE ... ENABLE
   RLS`, 111 `CREATE POLICY`, 18 `CREATE TRIGGER`, plus idempotent DROPs and
   COMMENTs.
3. **Coverage**: policy tables ≡ schema tables (24/24); every table has
   ENABLE RLS + ≥1 policy; all 111 DROP/CREATE policy pairs match.
4. **No unrestricted policies**: zero `USING (true)` / `WITH CHECK (true)`
   (case-insensitive scan).
5. **Policy-shape checks**: no `USING` on INSERT policies, no `WITH CHECK`
   on DELETE policies, no `WITH CHECK` on SELECT policies.
6. **Reference integrity**: every `smartsprint_*` identifier referenced
   resolves to a defined function (17/17); no policy references a direct
   `organization_id` on tables that lack the column; all trigger OLD/NEW
   columns exist on their tables; enum casts use existing types
   (`user_role`, `approval_status`, `change_request_status`).
7. **Privilege-escalation scan**: `organization_members` and `invitations`
   writes are ADMIN-only; `users` has no role column and `users.id` is
   trigger-pinned; request/decide attribution forced (`requester_id`,
   `decided_by`, `approved_by`, `owner_id`, `created_by` = self where
   applicable); no self-approval on `approvals` (`requester DISTINCT FROM
   decider`) and no self-decision on `change_requests` (`status='pending'` or
   `requester_id IS DISTINCT FROM auth.uid()`, approvals-parity);
   budgets ADMIN-only; audit tables client-immutable.
8. **Regression safety**: `npm run typecheck` passes; `git status` shows only
   the new migration + this doc (allowed paths).
9. **NOT performed (no live DB reachable)**: the `DATABASE_URL` host does not
   resolve from this environment and the Docker daemon is unavailable, so the
   migration was **not** applied and the §5 behavioral spot-checks
   (fixture-JWT matrix in the migration's Section 5 comments) were **not**
   executed. They must run against a reachable Supabase/Postgres instance
   before sign-off (see §9).

---

## 9. Unresolved issues / required follow-ups

1. **Live application + behavioral test pass outstanding.** Apply
   `0002_rls_security_foundation.sql` to a reachable database
   (`supabase db push` or `psql`), load the seed via the privileged lane,
   then execute the fixture-JWT matrix from `auth-rls-test-plan.md`
   (ISO/RBAC/TASK-DEV/NOTIF/LOG/AI suites) and the migration §5 checklist.
   Until then every isolation expectation is validated statically only.
2. **PM project-delete semantic** (`auth-rls-architecture.md` §12-Q4):
   implemented as ADMIN-only delete (projects have no owner column to
   enforce "own-created"). If product requires PM delete-own, add a
   `created_by` column + policy in a follow-up migration (do not weaken RLS
   without it).
3. **PM invitation-send** (§12-Q3): implemented as ADMIN-only (v1 default per
   test plan). Flip by adding a staff INSERT policy if product confirms.
4. **DEV team-visibility restriction (enforced, plan MEMB-04/RBAC-TEAM-01)**: team reads are NOT org-wide.
   `teams_select_org_member` grants ADMIN/PROJECT_MANAGER full org visibility via
   `smartsprint_is_org_staff(organization_id)`, while DEVELOPERs see only teams
   with a `team_members` row for `auth.uid()` (plus org membership). Static
   contract: `tests/database/rls.test.ts` ("teams SELECT restricts developers
   to their own teams…") pins org-membership + `team_members` + `auth.uid()`
   and zero `USING(true)`; live: `MEMB-04/live` pins zero foreign-team rows.
5. **Drizzle meta journal**: `supabase/migrations/meta/_journal.json` and
   snapshots were intentionally left untouched (Drizzle does not model RLS;
   this is a custom SQL migration deployed via Supabase/psql). If the team
   requires journal parity, the Database agent should reconcile via its own
   `db:generate` flow — do not hand-edit snapshots.

---

## 10. Policies intentionally requiring the future trusted server/service-role lane

RLS denies these for normal authenticated callers **by design**; implement
them server-side with `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_*`,
never browser code), re-validating membership/role before acting:

- Organization provisioning + first ADMIN membership; org deletion.
- Invitation acceptance (invitee is not yet a member) and expiry sweeps.
- `activity_logs` appends (all roles) and any audit reads needing
  cross-project aggregation.
- `ai_predictions` creation (AI pipeline); notification generation.
- Signup profile bootstrap (`auth.users` → `public.users` with `id = auth.uid()`)
  if the trigger path is chosen; account deactivation/deletion flows.
- **Concurrent signup race**: due to the absence of an auth→public users trigger,
  the application must handle profile creation atomically. The `users_email_key`
  unique constraint prevents duplicate emails, and the
  `users_insert_self`/`users_update_self` policies enforce owner-only writes.
  Serverside: use `INSERT ... ON CONFLICT (email) DO NOTHING` or an Edge Function
  to make signup idempotent and race-safe.
- Any PM-delete or cross-project move workflows from §9 if product approves
  them (keep denied in RLS; audit in the lane).
- **Privileged-pool warning**: the existing Drizzle `pg.Pool` over
  `DATABASE_URL` bypasses RLS. User-facing reads/writes must either use a
  per-request Supabase client carrying the caller JWT (so this migration
  applies) or re-enforce the §5 checks server-side. Merely enabling RLS
  does not secure that pool.
