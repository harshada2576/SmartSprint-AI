# Auth & RLS Security Test Plan — SmartSprint AI

> **Status:** PLAN ONLY — do not implement tests yet.
> **Scope:** READ-ONLY analysis. No changes to source, schema, migrations, seed, Auth config, or RLS were made to produce this plan.
> **Generated:** 2026-09-09
> **Normative inputs:**
> - `supabase/schema.ts` (637 lines — post-`0001` schema: `users.role` **removed**, `organization_members.role` authoritative)
> - `docs/database/auth-rls-architecture.md` (PROPOSAL, §5 authorization matrix, §6 RLS sketches)
> - `docs/database/final-schema-specification.md` (AUTHORITATIVE — supersedes conflicts; §2–7 table specs, §8 derived values, §11 ER diagram)
> - `docs/database/frontend-data-mapping.md` (§9 roles/UI access, §10 storage, §11 realtime)
> - `docs/database/seed-data-specification.md` + `seed/*.json` (3 tenants) + `scripts/seed.cjs`
> - `src/app/api/**` (8 routes, all unauthenticated `GET getAll*`) + `src/repositories/**` (unfiltered `db.select()`) + `src/db/index.ts` / `supabase/client.ts` (direct `node-postgres` pool via `DATABASE_URL` — **bypasses RLS**)
> - `supabase/migrations/0000_initial_schema.sql` (no `ENABLE ROW LEVEL SECURITY`, no `CREATE POLICY`) + `0001_add_organizations_and_governance.sql` (tenancy + governance, no RLS, no signup trigger, no storage buckets)
> - `tests/README.md` (expected locations: `tests/database/rls.test.ts`, `tests/auth/{auth,rls-policies,permissions}.test.ts`, `tests/api/*.api.test.ts`)

---

## Table of Contents

1. [Ground Truth & Preconditions](#1-ground-truth--preconditions)
2. [Test Fixtures & Conventions](#2-test-fixtures--conventions)
3. [Normative Permission Matrix](#3-normative-permission-matrix)
4. [Supabase Auth Tests](#4-supabase-auth-tests)
5. [Organization Isolation Tests](#5-organization-isolation-tests)
6. [Role Tests (ADMIN / PROJECT_MANAGER / DEVELOPER)](#6-role-tests)
7. [Developer Task Rule Tests](#7-developer-task-rule-tests)
8. [Project / Team Membership Tests](#8-project--team-membership-tests)
9. [Documents & Folders Tests](#9-documents--folders-tests)
10. [Notifications & Preferences Tests](#10-notifications--preferences-tests)
11. [Governance Records Tests](#11-governance-records-tests)
12. [Activity Logs / AI Predictions / Invitations Tests](#12-activity-logs--ai-predictions--invitations-tests)
13. [API Authorization Tests](#13-api-authorization-tests)
14. [Storage Tests](#14-storage-tests)
15. [Realtime & Service-Role Boundary Tests](#15-realtime--service-role-boundary-tests)
16. [Priority Legend & Execution Order](#16-priority-legend--execution-order)
17. [Future Automation Approach](#17-future-automation-approach)
18. [Traceability Checklist](#18-traceability-checklist)
19. [Open Questions Blocking Test Sign-Off](#19-open-questions-blocking-test-sign-off)

**Per-test fields:** `ID | Scenario (steps) | Expected result | Security requirement | Priority | Automation note`.
`R` = SELECT, `W` = INSERT/UPDATE, `D` = DELETE. All RLS tests assume a **future RLS implementation** per final-spec §2–7 + auth-architecture §6; until then every isolation test is **expected to FAIL** (fail-open) and that failure is itself the finding.

---

## 1. Ground Truth & Preconditions

### 1.1 Authoritative authorization source

- `organization_members.role` (`ADMIN | PROJECT_MANAGER | DEVELOPER`, default `DEVELOPER`) is the **only** authorization source (final-spec §1.2, §2.3; migration `0001` drops `users.role`). Any test or policy reading a global `users.role` is **invalid** — there is no such column in `supabase/schema.ts:60-75`.
- Tenancy root is `organizations.id`. Direct `organization_id` exists on: `organizations`, `organization_members`, `teams` (`schema.ts:79`), `projects` (`schema.ts:100`), `invitations` (`schema.ts:385`), `activity_logs` (nullable, `schema.ts:302`). Everything else derives org transitively: `sprints/requirements/tasks/backlog → projects.organization_id`; `budget_line_items/contracts/approvals/risks/change_requests/milestones/folders/documents → projects.organization_id`; `ai_predictions → requirements → projects`; `team_members → teams.organization_id`; `project_members → projects.organization_id`; `notifications/user_preferences → users` (user-scoped, **not** org-scoped).
- `project_members` / `team_members` are **membership-only** join tables with **no role column** (`schema.ts:348-381`). Tests must never assert a project-level role.

### 1.2 Current-state findings the plan is designed against

| # | Finding | Evidence | Test impact |
|---|---------|----------|-------------|
| F1 | **No RLS enabled anywhere.** No `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` in `0000`; `0001` adds tables but no policies. | `0000_initial_schema.sql`, `0001_*.sql` (518 lines, §§2–6, no RLS section) | All ISO/RBAC tests currently fail-open; plan records post-RLS expected results so the same cases become regression gates. |
| F2 | **API + repositories bypass RLS by construction.** All 7 data routes (`projects`, `tasks`, `requirements`, `sprints`, `backlog`, `ai-recommendations`, `notifications` stub) call `getAll*()` → `db.select().from(table).orderBy(...)` with no `WHERE`, no auth, no org filter. `src/db/index.ts:14-21` and `supabase/client.ts:14-18` use a privileged `pg Pool` (`DATABASE_URL`), not a user-JWT Supabase client. | `src/app/api/*/route.ts`, `src/repositories/*.ts`, `src/db/index.ts` | API tests (§13) must assert 401 + org scoping; today they return 200 with cross-org data. Fix requires per-request user client (`auth.uid()`) or server-side membership check — test plan does not prescribe the fix. |
| F3 | **No signup trigger observed.** `public.users.id` must equal `auth.users.id` (final-spec §2.2) but neither migration creates `auth.handle_new_user` or an Edge Function trigger. | `0000` + `0001` full-text search: no `auth.users`, no `TRIGGER`, no `supabase/functions/**` files found | AUTH tests cover orphaned-auth-user (fail-closed) and trigger behavior once implemented. |
| F4 | **No storage buckets/policies observed.** Spec requires `project-documents` (private) + `avatars` (public); no bucket creation in migrations. | final-spec §6.3; `0001` §§5–6 (tables only) | STOR tests are written against the specified path conventions and must be skipped-with-reason until buckets exist. |
| F5 | **Seed is multi-tenant with per-org role variance** — ideal for isolation tests, but also contains cross-org memberships that tests must account for (see §2). | `seed/organizations.json` (3 orgs), `seed/organization_members.json` (60+ rows) | Fixture section pins exact IDs so tests are deterministic. |

---

## 2. Test Fixtures & Conventions

### 2.1 Tenant fixtures (from `seed/*.json` — do not reseed ad hoc)

| Alias | Seed row | Notes for tests |
|-------|----------|-----------------|
| **Org A (primary)** | `382db5f8-3744-4915-8dca-59e55fce3229` — "Nimbus Software Solutions" | ~30 memberships; has the only large project/task corpus. Default isolation counterparty. |
| **Org B** | `23b6b6c9-c0c0-42d7-9b32-a2e93292696a` — "Beacon Digital Ventures" | 10 memberships. Org A user `X` Org B data is the canonical isolation assertion. |
| **Org C** | `716560fb-6bd4-4481-b5b7-07d68a9ad7c1` — "Coral Reef Analytics" | 8 memberships. Third-party observer for negative tests. |

### 2.2 User fixtures (stable IDs — prefer these over generated users)

| Alias | `users.id` | Org A role | Org B role | Org C role | Why pinned |
|-------|-----------|------------|------------|------------|------------|
| `adminA` | `462fd273-1ab0-4595-b54d-88a0532a69e6` | ADMIN (Org A) | **DEVELOPER** (Org B) | — | Proves role is org-scoped, not global (same human, different authority per org). |
| `pmA` | `a1244bef-a8ab-4f35-b87e-02c136833113` | PROJECT_MANAGER | — | — | Canonical PM actor in Org A. |
| `devA1` (task owner) | pick seeded task assignee in Org A project, e.g. resolve at runtime from `seed/tasks.json` + `seed/project_members.json` | DEVELOPER | — | — | Own-task vs other's-task branch. |
| `devA2` (peer) | second assignee on **same** Org A project, different `assignee_id` | DEVELOPER | — | — | Peer-modification negative test. |
| `adminB` | `06d03d9d-6447-4f26-9e1b-0e02d83095b2` | — | ADMIN | — | Cross-org admin: must still get zero Org A rows (membership gates even ADMIN). |
| `multiDev` | `21f08f45-030c-46c1-90d6-07a1c2d387f7` | DEVELOPER (Org A) | DEVELOPER (Org B) | DEVELOPER (Org C) | Member of all three orgs — positive control (sees scoped rows in each) + negative control (cannot blend them). |
| `outsider` | freshly created `auth.users` + `public.users` with **zero** `organization_members` rows | none | none | none | Fail-closed: zero rows everywhere except own `users` self-row (if policy allows) + own preferences. |
| `anon` | no JWT | — | — | — | Every table + every API route + storage: deny. |

> Fixture rule: tests resolve project/task/document IDs **at runtime by org** (e.g. "any `projects` row with `organization_id = Org B`", "any `tasks` row with `project_id ∈ Org B projects`") rather than hardcoding volatile IDs, except the org/user IDs above which are stable seed PKs. Multi-membership rows (e.g. `aab373a6…` in Org A + Org B, `4aa24f06…` in all three implied by seed) must be excluded from "pure outsider" cases — use `outsider` for those.

### 2.3 General test harness conventions

- **RLS tests** run as the table owner via `service_role` for setup, then switch to a per-fixture authenticated client (user JWT, `auth.uid() = fixture user`) for the assertion. Never assert with the setup client.
- **Negative SELECT** = expect **zero rows** (not an error) for RLS-filtered reads; expect `401/403` for API denials; expect RLS violation error for disallowed INSERT/UPDATE/DELETE.
- **"Where applicable" for D:** join tables (`organization_members`, `team_members`, `project_members`) support INSERT/DELETE but not UPDATE (composite PK, no payload columns except `role` on `organization_members`); `user_preferences` supports upsert-by-owner only; append-only `activity_logs` should reject client INSERT/UPDATE/DELETE entirely (server-generated) — tests assert this.

---

## 3. Normative Permission Matrix

Effective role = `organization_members.role` **in the organization that owns the target row**. Non-members have **no access** regardless of role elsewhere. `R/W/D` per auth-architecture §5 as refined by final-spec §§3–7 and frontend §9.2. **Deletions are ADMIN-or-owner; role promotion is ADMIN-only; DEVELOPER writes are own-assigned-tasks only.**

| Resource (scope) | ADMIN (own org) | PROJECT_MANAGER (own org) | DEVELOPER (own org) | Cross-org (any role) |
|---|---|---|---|---|
| **projects** (org via `projects.organization_id`) | R/W/D | R all; W create + update managed/all; D own-created only (confirm; arch §12-Q4) | R **member projects only**; no create; no D | — (deny all) |
| **requirements** (via `project_id`) | R/W/D | R/W all in org | R member projects; W **own assigned items only** (assignee=self; arch §5.1-rule 3 extended) | — |
| **sprints** (via `project_id`) | R/W/D | R/W | R member projects; no W (no planning/capacity) | — |
| **tasks** (via `project_id`) | R/W/D incl. reassign | R/W incl. reassign | R member projects; W **only `assignee_id = self`** (see §7 for field-level rules) | — |
| **teams** (org via `teams.organization_id`) | R/W/D | R (view) | R own team (view) | — |
| **team_members / project_members** (via team/project org) | R/W (manage membership) | R | R (own memberships readable) | — |
| **documents + folders** (via `project_id`) | R/W/D | R/W project docs | R project docs; W upload to own project (create; update own only; no D of others) | — |
| **budget_line_items** (`budgets`; via `project_id`) | R/W/D | R only (write-budget ADMIN-only) | R relevant (member project) | — |
| **contracts** (via `project_id`) | R/W/D | R/W | R relevant | — |
| **approvals** (governance; via `project_id`) | R/W/D incl. decide | R/W incl. request + decide-as-PM (decide-by must be ADMIN or PM, never requester-self-approve — test both) | R relevant; W create-request only (cannot decide) | — |
| **risks** (via `project_id`) | R/W/D | R/W | R relevant; W create-only (confirm; default R per arch §12-Q6 — test asserts create-allowed/decide-denied split) | — |
| **change_requests** (via `project_id`) | R/W/D incl. decide | R/W incl. decide | R relevant; W create-request only | — |
| **milestones** (via `project_id`) | R/W/D | R/W | R relevant | — |
| **notifications** (**user-scoped**, `user_id = auth.uid()`) | R own only (W system-generated, not client) | R own only | R own only | — (even ADMIN cannot read another user's inbox) |
| **user_preferences** (PK `user_id`) | R/W own only | R/W own only | R/W own only | — |
| **activity_logs** (org/project nullable; append-only) | R org scope | R org/project scope | R own-project scope | — ; client W/D denied for **all** roles |
| **ai_predictions** (via `requirement → project`) | R + approve/apply (`recommendation_status`, `approved_by/at`) | R + approve/apply | R own-project; **cannot** approve | — |
| **invitations** (via `organization_id`) | R/W send + revoke | default **R only** in v1 (PM-send is DEFER per arch §5/§12-Q3 — test asserts deny) | — (deny all) | — |
| **organizations / organization_members** | R own org; W org settings/billing + role assignment | R own org; no settings W; no role W | R own membership only; no W | — |
| **users directory** | R org directory; W create/promote/deactivate (ADMIN-only path) | R team/project members | R self + teammates | — (cannot enumerate foreign org users) |

> Where this matrix is stricter than frontend §9.2 (e.g. frontend shows DEVELOPER "YES" on Documents, "View own" on Reports), the matrix governs — frontend visibility is not authorization. Every "YES (filtered)" in §9.2 maps to a membership-scoped RLS predicate, tested in §6.

---

## 4. Supabase Auth Tests

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| AUTH-01 | Sign-up with email/password creates `auth.users`; `public.users` profile row appears with `id = auth.users.id`, `email` copied, defaults (`status='active'`, names from metadata). | Profile exists within trigger window; `users.id` equals `auth.uid()`. | Every auth identity has exactly one profile; RLS `auth.uid()` joins never dangle (arch §3.1; final-spec §2.2). | **P0** | `tests/auth/auth.test.ts`: sign up via `supabase.auth.signUp`, poll `users` with service_role, assert equality + defaults. Currently **fails** (no trigger — record as blocked). |
| AUTH-02 | Sign-up does **not** accept a client-supplied role; crafted `user_metadata.role='ADMIN'` / direct `users` INSERT with elevated role is ignored or rejected. | New membership defaults to `DEVELOPER`; no `organization_members.role='ADMIN'` created by self-signup path. | No client-side signup of roles; promotion is admin action (arch §3.1, §5.1-rule 4). | **P0** | Attempt metadata injection + direct `organization_members` self-INSERT as fresh user; assert `DEVELOPER`/deny. |
| AUTH-03 | First-org creation path: signup user with no org who creates an organization becomes its ADMIN via server-side flow (not client INSERT into `organization_members`). | Exactly one `organization_members` row `(newOrg, newUser, ADMIN)`; org row exists. | Org creation cannot be spoofed to grant ADMIN in someone else's org (arch §3.2). | **P0** | Drive the real server flow (Edge/route once built); assert membership + that raw client INSERT of `(otherOrg, self, ADMIN)` is denied (see ISO-20). |
| AUTH-04 | Invitation acceptance: invited email + valid non-expired `invitations` row yields membership with **invited** role, invitation flips to `accepted`; expired/rejected/foreign-org invite yields nothing. | Happy path creates membership; replay of same invite, tampered `organization_id`, or expired invite creates nothing. | Invites are org-scoped capabilities, not self-grants (final-spec §2.4; `expires_at`). | **P0** | Seed `invitations` (Org A PM invite + expired Org B invite); accept as matching/non-matching user; assert outcomes. |
| AUTH-05 | Orphaned auth user (exists in `auth.users`, missing in `public.users`, e.g. trigger outage) gets **fail-closed** access: own-directory read returns nothing, all business tables return zero rows, writes denied. | Zero rows everywhere; no error leaking other tenants' existence. | Fail-closed RLS: no row → no access (arch §10). | **P1** | Create auth user, delete/hold back profile row, run matrix spot-checks as that JWT. |
| AUTH-06 | Deactivated user (`users.status='inactive'`) and deleted user (`auth.users` deleted → cascade) lose access; `organization_members` rows cleaned; notifications/preferences cascade. | Inactive: auth blocked or zero data rows (per product decision — test pins whichever is specified); deleted: memberships gone, login impossible. | Status-gated access; cascade hygiene (final-spec §2.2–2.3 delete behaviors). | **P1** | Toggle `status` via service_role; attempt read/write as that JWT; delete auth user; assert cascades. |
| AUTH-07 | Session/JWT tampering: expired token, wrong audience, stripped `sub`, or `anon` key used as user token. | All data APIs + direct table reads deny (401/zero rows); no fallback to anon-readable data. | No unauthenticated bypass (see also API-01). | **P0** | Replay requests with mutated/expired tokens against one representative table per scope (org/project/user). |
| AUTH-08 | `users.id` FK integrity: attempt to INSERT `public.users` with `id ≠ auth.users.id` (arbitrary UUID) or duplicate `email`. | Rejected (PK/FK/unique violation or RLS deny — test asserts rejection, not mechanism). | `users.id = auth.users.id` invariant (final-spec §2.2). | **P1** | Service_role attempts colliding insert; authenticated user attempts to insert second profile. |

---

## 5. Organization Isolation Tests

> Canonical assertion for every row below: **`Org A user × Org B data is impossible.`** Each table group is tested on all four operations where applicable (S/I/U/D). Setup with service_role; assert with `devA1`/`pmA`/`adminA` JWTs against Org B rows, and mirror with `adminB` against Org A rows (proves ADMIN does not cross orgs). `multiDev` asserts per-org visibility without blending.

### 5.1 Direct-org tables (`organizations`, `organization_members`, `teams`, `projects`, `invitations`)

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| ISO-01 | SELECT `organizations`: Org A member lists orgs. | Returns **only** orgs where requester is a member (Org A; plus others only for `multiDev`). Org B/C rows absent. | Tenant-root isolation (arch §6.2). | **P0** | `tests/database/rls.test.ts` + `tests/auth/rls-policies.test.ts`: assert ID sets. |
| ISO-02 | SELECT `organization_members` cross-org: Org A user queries Org B memberships. | Zero rows. | Membership table itself is org-gated. | **P0** | Same harness; also assert `outsider` sees zero rows. |
| ISO-03 | SELECT `teams` / `projects` cross-org (Org A JWT vs Org B `team_id`/`project_id`, by ID and by list). | Zero rows / empty list; no existence oracle (same response as nonexistent ID). | Org-scope via `teams.organization_id`, `projects.organization_id` (`schema.ts:79,100`). | **P0** | By-ID + filtered-list variants; compare with invalid-UUID response shape (see API-04). |
| ISO-04 | SELECT `invitations` cross-org: Org A user reads Org B invites. | Zero rows. | Invite secrecy per org (final-spec §2.4). | **P0** | Seed pending invites in both orgs. |
| ISO-05 | INSERT `projects`/`teams` with `organization_id = Org B` as Org A user (incl. ADMIN). | Denied (RLS violation). | Writes bound to member org; ADMIN is not global. | **P0** | Attempt with `adminA` JWT (strongest negative). |
| ISO-06 | UPDATE/DELETE Org B `projects`/`teams` row as Org A user. | Denied; row unchanged/deleted-count zero. Verify with service_role re-read. | Same as ISO-05 for mutations. | **P0** | Re-read via service_role to prove no-op. |
| ISO-07 | INSERT `organization_members (Org B, self, DEVELOPER)` as self (self-join foreign org). | Denied. | Membership requires invite/creation flow, never self-grant (AUTH-03/04). | **P0** | Also attempt `(Org B, self, ADMIN)` — must deny (escalation + isolation combined). |
| ISO-08 | DELETE another user's `organization_members` row in Org B as Org A ADMIN. | Denied. | Cross-org membership tampering impossible. | **P0** | — |
| ISO-09 | INSERT `invitations` targeting Org B as Org A user (any role). | Denied. | Invites writable only within own org by ADMIN (matrix). | **P1** | Positive control: Org B ADMIN can (see RBAC-INV-01). |

### 5.2 Project-derived tables (`sprints`, `requirements`, `tasks`, `backlog`, governance, `folders`/`documents`, `milestones`)

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| ISO-10 | SELECT cross-org chain: Org A JWT reads Org B `sprints`, `requirements`, `tasks`, `backlog` (by parent `project_id` and by direct row ID). | Zero rows in all four. | Transitive org derivation via `project_id` (arch §6.2; final-spec §§3–4). | **P0** | Parameterize over the four tables × (by-ID, by-project-list). |
| ISO-11 | INSERT into Org B project: `sprints`/`requirements`/`tasks`/`backlog` with `project_id ∈ Org B` as Org A user. | Denied for every table. | No cross-org child creation (would orphan tenancy). | **P0** | Include `tasks` with `assignee_id=self` — still denied (org check precedes self-task rule). |
| ISO-12 | UPDATE/DELETE Org B `sprints`/`requirements`/`tasks`/`backlog` rows as Org A user. | Denied; service_role re-read confirms untouched. | Same as ISO-11 for mutations. | **P0** | Cover `column_status` move (task-flow mutation) explicitly — cross-org move denied. |
| ISO-13 | SELECT/INSERT/UPDATE/DELETE on governance (`budget_line_items`, `contracts`, `approvals`, `risks`, `change_requests`, `milestones`) in Org B project as Org A user (all roles incl. ADMIN). | All denied (SELECT → zero rows; writes → RLS error). | Governance is project→org scoped (final-spec §5; `project_id` CASCADE). | **P0** | Parameterize 6 tables × 4 ops = 24 assertions; share helper `governanceTables()`. |
| ISO-14 | SELECT/INSERT/UPDATE/DELETE on `folders`/`documents` metadata in Org B project as Org A user. | All denied. | Document metadata is project-scoped (`schema.ts:552-621`). | **P0** | Pair with STOR-01..04 (object-level). |
| ISO-15 | FK-smuggling: INSERT `tasks` with `project_id ∈ Org A` (allowed org) but `sprint_id`/`requirement_id ∈ Org B`. Same for `requirements.sprint_id`, `ai_predictions.suggested_sprint_id`, `documents.folder_id`, `backlog.requirement_id`. | Denied (same-project consistency rule, final-spec §4 + seed-spec §4.2). | Prevents laundering foreign-org linkage through a legal parent. | **P0** | 5+ cross-FK variants; assert rejection even when direct parent is legal. |
| ISO-16 | SELECT `activity_logs` with `organization_id = Org B` / `project_id ∈ Org B` as Org A user. | Zero rows. | Audit trail is tenant-scoped (final-spec §7.2). | **P1** | Also assert Org B rows never appear in unfiltered Org A feed. |
| ISO-17 | SELECT `ai_predictions` for Org B requirement as Org A user. | Zero rows. | AI data derives org via requirement (final-spec §7.3). | **P1** | — |
| ISO-18 | Cross-org assignee/owner smuggling: INSERT/UPDATE Org A row setting `assignee_id`/`owner_id`/`manager_id`/`lead_id` to a user who is **not a member of Org A** (e.g. pure Org B user). | Denied (or constrained) — test pins specified behavior: membership-scoped assignees only (seed-spec §4.1/§4.4). | Prevents leaking work items to outsiders + oracle on foreign user existence. | **P1** | Variants: `tasks.assignee_id`, `requirements.assignee_id`, `risks.owner_id`, `projects.manager_id`, `teams.lead_id`. |

### 5.3 User-scoped tables (`notifications`, `user_preferences`, `users`)

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| ISO-19 | SELECT `notifications`/`user_preferences` belonging to an Org B user, as Org A user (even ADMIN). | Zero rows. | Inbox/preferences are `user_id = auth.uid()`-scoped, not org-readable (matrix; final-spec §§7.1/7.4). | **P0** | Include `adminA → adminB inbox` variant. |
| ISO-20 | UPDATE `organization_members.role` for self or others (self-promote DEVELOPER→ADMIN; PM→ADMIN; cross-org grant). | All denied; role unchanged on service_role re-read. | ADMIN-only promotion; no self-escalation (arch §5.1-rule 4, §10). | **P0** | 4 variants: self-up, peer-up, PM-up-other, cross-org-up. Positive control RBAC-ROLE-01 (Org ADMIN promotes within own org). |
| ISO-21 | SELECT `users` directory cross-org: Org A user queries Org B-only users (users with no shared org). | Zero rows; user-enumeration oracle closed. `multiDev` sees each org's directory only within that org context. | Org-gated directory (matrix). | **P0** | Assert by-ID + search-list; contrast with teammate-visible positive. |

---

## 6. Role Tests

> Run **within a single org (Org A)** with membership held constant; vary only `organization_members.role`. Every case also runs as non-member (`outsider`) expecting deny (not repeated per row). Role fixtures: `adminA`, `pmA`, `devA1`. Project fixtures: one shared Org A project where all three are `project_members` (member-context) + one Org A project where `devA1` is **not** a member (non-member-context) to separate org-role from project-membership effects.

### 6.1 Projects / requirements / sprints / tasks / backlog

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| RBAC-PROJ-01 | List/read `projects`: ADMIN, PM, member-DEV read Org A projects. | All three succeed (DEV only for member projects; non-member Org A project hidden from DEV — see §8). | R-member gating (matrix). | **P0** | Assert row sets, not just status. |
| RBAC-PROJ-02 | Create `projects`: ADMIN + PM succeed; DEV denied. | 201/created vs RLS deny. | Project creation W-gated (matrix). | **P0** | — |
| RBAC-PROJ-03 | Update/delete `projects`: ADMIN full; PM update allowed, delete own-created only; DEV denied both. | Matches matrix; verify owner semantics on service_role re-read. | Destructive ops restricted (arch §5.1-rule 5; open Q4 — test documents chosen semantic). | **P1** | Two PM variants: own-created vs foreign-created project. |
| RBAC-REQ-01 | `requirements` R: ADMIN + PM all in org; DEV member-projects only. | Correct scoping. | Membership-tightened reads (arch §6.3). | **P0** | — |
| RBAC-REQ-02 | `requirements` W: ADMIN + PM create/update anywhere in org; DEV create denied, update own-assigned only. | DEV non-assigned update denied. | Self-write refinement (matrix). | **P1** | Pair with TASK-DEV suite for field rules. |
| RBAC-SPR-01 | `sprints` R/W: ADMIN + PM full; DEV read-only (planning/capacity denied). | DEV INSERT/UPDATE/DELETE denied. | Sprint planning is PM+ (frontend §9.2 + matrix). | **P1** | Include `total_points`/`completed_points` tamper variant (DEV denied). |
| RBAC-TASK-01 | `tasks` R: all roles read member-project tasks. | Success with correct scoping. | Baseline before write restrictions. | **P0** | — |
| RBAC-TASK-02 | `tasks` W by role: ADMIN + PM create/update/delete incl. reassign; DEV restricted (see §7). | Non-assigned DEV writes denied. | Core least-privilege rule. | **P0** | Delegates field matrix to §7. |
| RBAC-BACK-01 | `backlog` R/W: ADMIN + PM manage rank; DEV read-only. | DEV INSERT/UPDATE(rank)/DELETE denied. | Backlog ordering is planning authority. | **P1** | Rank-reorder variant. |

### 6.2 Teams

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| RBAC-TEAM-01 | Read `teams`: ADMIN + PM view org teams; DEV views own team(s) (non-member teams hidden — exact scope per §8 decision). | Scoped row sets. | Team visibility gating (matrix). | **P1** | Resolve own-team via `team_members` fixture. |
| RBAC-TEAM-02 | Create/update/delete `teams` + manage `team_members`: ADMIN allowed; PM + DEV denied. | PM/DEV writes denied. | Team membership is ADMIN-only (matrix). | **P1** | Variants: add-member, remove-member, change `lead_id`. |

### 6.3 Role assignment / invitations / users directory

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| RBAC-ROLE-01 | Promote/demote/deactivate within own org: ADMIN succeeds (DEV→PM, PM→DEV, deactivate/reactivate); PM + DEV denied. | Only ADMIN path works; audit via re-read. | ADMIN-only role administration (arch §5.1-rule 4). | **P0** | Positive control for ISO-20. |
| RBAC-INV-01 | Send/revoke `invitations`: ADMIN succeeds; PM denied in v1 (DEFER per arch §12-Q3); DEV denied. | PM-send denied **until** product confirms otherwise — test encodes v1 default. | Invite authority (matrix). | **P1** | Tag `spec-defer`; flip expected result if Q3 resolves to PM-allowed. |
| RBAC-USER-01 | Directory + profile writes: ADMIN views org directory and edits/deactivates; PM views team/project members only; DEV views self + teammates; users edit own profile only (except ADMIN). | Scoped reads; cross-profile writes denied. | Directory least-privilege (matrix). | **P1** | Variants: read-by-ID, search, update-foreign-profile, deactivate. |

---

## 7. Developer Task Rule Tests

> **Rule under test (finalized model):** a DEVELOPER may write **only tasks where `assignee_id = auth.uid()`**, within projects they are members of, in their own org — and **cannot reassign** (change `assignee_id`), cannot touch `project_id`/`sprint_id` linkage to escape scope, and cannot modify tasks assigned to other developers. ADMIN/PM are exempt (full W incl. reassign). Requirement writes follow the same assignee-self principle (RBAC-REQ-02).

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| TASK-DEV-01 | DEV updates **own** task (`assignee_id = self`, member project): advance `column_status` (todo→inProgress→review), edit `title`/`description`, set `due_date`. | Allowed. | Positive control proving self-write works (matrix; arch §5.1-rule 3). | **P0** | Use `devA1` + own task fixture. |
| TASK-DEV-02 | DEV updates **peer's** task (same project, `assignee_id = devA2`): any field (`column_status`, `title`, `points`, `due_date`). | **Denied** — all fields, all columns. | Cannot modify tasks assigned to other developers unless explicitly allowed (task prompt rule; default deny). | **P0** | Strongest negative; run for each mutable column. |
| TASK-DEV-03 | DEV attempts **reassignment**: own task with `assignee_id` changed to peer/unassigned; peer task claimed via `assignee_id = self`. | Denied in both directions. | Assignee changes are ADMIN/PM-only (matrix). | **P0** | Two variants: give-away + claim. |
| TASK-DEV-04 | DEV creates task: with `assignee_id = self` in member project vs `assignee_id = peer` / unassigned / in non-member project. | Self-assigned-in-member-project allowed (if product allows DEV create at all — otherwise denied; test pins chosen semantic); all other variants denied. | Create-path cannot mint work for others or outside membership. | **P1** | Tag `product-semantic`: flip allow/deny on self-create per confirmation without rewriting suite. |
| TASK-DEV-05 | DEV deletes task: own vs peer's. | Both denied by default (D is ADMIN-or-owner/PM+; matrix gives DEV no D) — test asserts deny; if product grants self-delete, own-variant flips with note. | No destructive DEV path. | **P1** | — |
| TASK-DEV-06 | DEV moves own task across scope boundaries: change `project_id`, `sprint_id` (to foreign sprint), or `requirement_id` (to foreign requirement). | Denied (even though task is "own"). | Scope-linkage tampering closed (extends ISO-15 to same-org scope escape). | **P0** | Three FK variants. |
| TASK-DEV-07 | DEV bulk/partial update touching peer rows (multi-row UPDATE with filter, upsert on `display_id` colliding with peer task). | Zero peer rows affected; operation denied or scoped to own rows only. | No set-based bypass of row rule. | **P1** | Assert via service_role before/after diff. |
| TASK-DEV-08 | Ex-PM/role-change freshness: user demoted PM→DEV retains no residual write on others' tasks; newly assigned task becomes writable immediately. | Demoted: peer writes denied; assigned: own writes allowed. | Effective role evaluated per-request from `organization_members` (arch §4.4). | **P1** | Change role via service_role mid-test, re-auth, assert. |
| TASK-DEV-09 | Unassigned-task pool (`assignee_id IS NULL`): DEV attempts to update/claim. | Denied (claim = reassignment). | Unassigned ≠ writable-by-all. | **P1** | — |

---

## 8. Project / Team Membership Tests

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| MEMB-01 | Same-org non-member project: DEV (org member, **not** `project_members`) reads project, its sprints/requirements/tasks. | Denied/hidden (member-gated reads) — test asserts hidden; if product chooses org-wide DEV read, document variance and require explicit sign-off. | "Their projects" scoping (arch §4.4; frontend "YES (member of)"). | **P0** | Use non-member Org A project fixture from §6 preamble. |
| MEMB-02 | PM read of non-managed project in own org. | Allowed (PM reads all in org per matrix) — contrast with MEMB-01. | Org-role vs membership distinction for PM. | **P1** | — |
| MEMB-03 | `project_members` management: ADMIN adds/removes; PM/DEV add-self-to-foreign-project denied. | Only ADMIN path works. | No self-enrollment into projects (would defeat MEMB-01). | **P0** | Self-add variant is the critical negative. |
| MEMB-04 | `team_members` + non-member team read: DEV reads own-team rows; foreign-team rows hidden; self-add to foreign team denied. | Scoped reads; self-add denied. | Team closure (matrix + §6.2). | **P1** | — |
| MEMB-05 | Manager/lead gating: set `projects.manager_id` / `teams.lead_id` to non-org-member; non-member manager reads managed project. | Write denied (ISO-18); read follows membership, not title — non-member manager gets no implicit read. | Titles don't confer access; membership does. | **P1** | — |

---

## 9. Documents & Folders Tests

> Metadata tables (`documents`, `folders`) are project-scoped (`project_id` NOT NULL; `folders.created_by` RESTRICT, `documents.owner_id` RESTRICT — `schema.ts:551-621`). Storage objects live in `project-documents` bucket at `{project_id}/{folder_id}/{document_id}/{filename}` (final-spec §6.3). Every metadata test has a storage twin in §14.

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| DOC-01 | Read project docs: ADMIN + PM + member-DEV list/read Org A project documents/folders; non-member DEV + all cross-org actors get zero rows. | Scoped reads. | Project-scoped document visibility (matrix). | **P0** | By-folder + by-project + by-ID variants. |
| DOC-02 | Upload/create: ADMIN + PM create in any org project; member-DEV creates in own project only; DEV in foreign project / cross-org denied. | Matches matrix ("W upload to own project"). | Upload bound to membership. | **P0** | Metadata INSERT; object upload twin STOR-01. |
| DOC-03 | Update/version: owner-DEV updates own doc (new version chain `parent_version_id`, `is_latest` flip); peer-DEV updates another's doc; anyone mutates `owner_id`/`project_id`/`storage_path`. | Own-update allowed; peer-update denied; `owner_id`/`project_id`/`storage_path` immutable to non-ADMIN (deny). | Version-chain integrity; no ownership theft or scope transplant. | **P1** | Assert single `is_latest=true` per chain after attempt. |
| DOC-04 | Delete: ADMIN deletes; owner-DEV deletes own (if product allows — otherwise deny); peer-DEV/PM-delete-others behavior per matrix (PM R/W but D own/ADMIN — pin semantic); cross-org delete denied for all. | Cross-org always denied; in-org per matrix. | Destructive doc control. | **P1** | Object-delete twin STOR-03. |
| DOC-05 | Folder ops: create/rename/move/delete folder: ADMIN + PM allowed; DEV create-in-own-project allowed, delete/rename-others denied; cross-org all denied; `parent_id` move across projects denied. | Scoped writes; cross-project graft denied. | Folder hierarchy cannot bridge projects. | **P1** | Unique `(project_id, parent_id, name)` collision variant. |
| DOC-06 | Version-history read: non-member/cross-org reads old versions (`is_latest=false` rows, `parent_version_id` chain). | Zero rows. | History is as sensitive as head. | **P1** | — |

---

## 10. Notifications & Preferences Tests

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| NOTIF-01 | Inbox read: each role reads own notifications; any read of another user's notification (same org, other org, ADMIN→anyone) returns zero rows. | Strict `user_id = auth.uid()` isolation. | Inbox privacy incl. from ADMIN (matrix). | **P0** | By-ID + filtered-list (`?type=`, `?read=`) variants; assert filters can't escape scope. |
| NOTIF-02 | Inbox write: user marks **own** notification read/unread (allowed); marks another's read, deletes another's, inserts notification for another user, or forges `type/priority` on system notifications. | Own-mark allowed; all cross-user writes + client-side creation denied (notifications are system-generated). | No inbox tampering or spoofed system alerts. | **P0** | Include `PATCH /api/notifications/:id/read` + `read-all` twins (API-05). |
| NOTIF-03 | Notification realtime subscription (once live): subscribe filtered by own `user_id` receives own rows; subscribing to another `user_id` yields nothing. | No cross-inbox realtime leak. | Realtime `user_id` filter (frontend §11.2; arch §10). | **P1** | Supabase Realtime channel test; tag `needs-realtime`. |
| PREF-01 | `user_preferences` (PK `user_id`): read/write own row (incl. upsert, `notification_preferences` JSONB); read/write another user's row. | Own allowed; foreign denied. | Preferences are per-user (final-spec §7.4). | **P1** | JSONB-shape fuzz variant (malformed prefs rejected, not stored). |

---

## 11. Governance Records Tests

> All six tables are project-scoped (`project_id` NOT NULL, CASCADE). Sensitive split: **budgets are ADMIN-write-only**; approvals/risks/changes are ADMIN + PM write with DEV create-request-only; contracts/milestones per matrix. Derived displays (`remaining`, `status`, `variance`, `severity`, milestone display status — final-spec §8.4) are **never** stored — tests assert no such columns are writable/required.

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| GOV-BUD-01 | `budget_line_items` R: ADMIN + PM + member-DEV read member-project rows; cross-org/non-member zero rows. | Scoped reads. | Financial visibility gating. | **P0** | — |
| GOV-BUD-02 | `budget_line_items` W/D: ADMIN allowed; PM **denied** (R-only); DEV denied. Includes `allocated`/`spent` tamper + `(project_id, category)` dup. | Only ADMIN writes; unique-category upheld. | Write-budget ADMIN-only (matrix). | **P0** | Critical: PM-write-deny is the matrix's sharpest split — test both INSERT and UPDATE. |
| GOV-CON-01 | `contracts` R/W/D: ADMIN full; PM R/W; DEV R relevant only (create/update/delete denied). Cross-org all denied. | Matches matrix. | Vendor-data control. | **P1** | `value`/`status`/`expiry` tamper variants. |
| GOV-APR-01 | `approvals` request: ADMIN + PM + DEV can **create** request in member project; cross-org denied. | Create-request is the DEV exception. | Request-vs-decide split. | **P1** | — |
| GOV-APR-02 | `approvals` decide: ADMIN + PM (non-requester) can approve/reject (`status`, `decided_by/at`); DEV denied; **self-approval** (requester decides own request) denied for every role. | Decide gated; self-approval always denied. | Separation of duties. | **P0** | Variants: PM-decides, DEV-decides (deny), requester-self-decides (deny), `decided_by` forgery (deny — must equal `auth.uid()` of decider). |
| GOV-RISK-01 | `risks` R/W: ADMIN + PM full; DEV read + create-only (update/close/mitigate denied; `owner_id` reassign denied). | DEV cannot close or reassign risks. | Risk-register integrity (matrix; arch §12-Q6 pinned to create-only). | **P1** | `probability`/`impact`/`status` tamper variants. |
| GOV-CHG-01 | `change_requests` request + decide: same split as approvals (DEV create-only; ADMIN/PM decide; no self-decide). | Matches GOV-APR-01/02. | Scope-change control. | **P1** | `display_id` (`CR-001` per-project uniqueness) collision variant. |
| GOV-MILE-01 | `milestones` R/W/D: ADMIN + PM full; DEV read-only (`completed`/`completed_at` flip denied). | DEV cannot complete milestones. | Timeline integrity. | **P1** | Derived-status variant: no stored `status` column accepted. |

---

## 12. Activity Logs / AI Predictions / Invitations Tests

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| LOG-01 | Read `activity_logs`: ADMIN/PM read org/project scope; DEV reads own-project scope; cross-org zero rows; `entity_id` polymorphic refs to foreign org never resolve. | Scoped reads; no cross-tenant audit leak. | Audit confidentiality (final-spec §7.2). | **P1** | Feed (unfiltered) + by-`project_id` + by-`entity_type` variants. |
| LOG-02 | Client INSERT/UPDATE/DELETE on `activity_logs` as any role (incl. ADMIN). | **All denied** — logs are server-generated (append-only). | Audit immutability; no history forgery or erasure. | **P0** | Attempt `action='approved'` forgery + delete-own-trace variant. |
| AI-01 | Read `ai_predictions`: ADMIN + PM read org/project predictions; DEV reads own-project only; cross-org zero rows. | Scoped reads via requirement chain. | AI data inherits project scope. | **P1** | By-`requirement_id` + by-`suggested_sprint_id` variants. |
| AI-02 | Approve/apply (`recommendation_status`, `approved_by/at`): ADMIN + PM allowed (`approved_by = auth.uid()` enforced); DEV denied; `approved_by` forgery (set to another user) denied. | Decide gated; attribution truthful. | AI approval authority (matrix; final-spec §7.3). | **P0** | Variants: DEV-approve (deny), PM-approve (allow), forgery (deny). |
| AI-03 | Governance/`approvals` vs AI-approval anti-confusion: approving an `ai_predictions` row creates **no** `approvals` row and vice versa. | No cross-table side effects. | Distinct workflows (final-spec §5.3/§7.3; seed-spec §4.5). | **P2** | Assert row counts in both tables after each decide op. |
| INV-01 | Invitation lifecycle R/W: ADMIN reads/sends/revokes in own org; PM read-only (v1); DEV none; cross-org none; accept-path per AUTH-04. | Matches RBAC-INV-01 + AUTH-04. | Invite authority + acceptance integrity. | **P1** | Expired-accept + double-accept + foreign-email-accept variants. |

---

## 13. API Authorization Tests

> **Context:** today's routes (`src/app/api/{projects,tasks,requirements,sprints,backlog,ai-recommendations}/route.ts` + empty `notifications/route.ts`) are unauthenticated `GET` → unfiltered `getAll*()`, and `health` exposes `db.execute`. The tests below define the **required** behavior; all are expected to **fail today** (200-with-data where 401/empty is required) — each failure is a tracked security defect, not a test bug.

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| API-01 | **Unauthenticated** `GET` on every data route (no token, expired token, `anon` key). | `401` (no body data). Never 200-with-rows. | No anonymous data access (arch §10 direct-table + §7 JWT rule). | **P0** | `tests/api/*.api.test.ts`: loop routes × token-states. |
| API-02 | **Authenticated in-scope** `GET` per role (ADMIN/PM/member-DEV with valid JWT). | `200` with **only** rows the caller may see under §3 (org + membership + user scoping). Response sets equal RLS direct-query sets. | API honors same predicates as RLS (no privileged-pool leak via F2). | **P0** | Diff API payload vs direct-RLS query per fixture; any surplus row = fail. |
| API-03 | **Cross-organization ID**: authenticated Org A caller requests Org B resource (`/api/projects?project_id=<OrgB>`, task/requirement/sprint/doc/approval IDs from Org B, nested `?project_id=` on governance/docs/backlog/AI routes once built). | `404` (indistinguishable from nonexistent) **or** `403` per API convention — pinned, consistent, with **zero** Org B fields. Never 200-with-data. | IDOR closure; no existence oracle. | **P0** | By-ID + query-param + nested-resource variants across all entity routes. |
| API-04 | **Invalid IDs**: malformed UUID, nonexistent UUID, wrong-type ID. | Pinned error shape (`400` malformed / `404` nonexistent), identical shape for foreign-org IDs (see API-03) to avoid oracle. | Error-shape parity prevents tenant enumeration. | **P1** | Compare response shapes/timings foreign-ID vs random-ID. |
| API-05 | **Manipulated `organization_id`**: caller passes `?organization_id=<OrgB>` (or body `organization_id`) while authed as Org A; body `project_id` swapped to Org B on create/update routes once built. | Server ignores/forbids foreign org — derives org from auth membership + URL-owned parent, never from client field. `403/404`, no write. | Client org fields are untrusted (ISO-05/11 at API layer). | **P0** | Query + body + header variants; assert no row created (service_role re-read). |
| API-06 | **Manipulated `user_id`/`assignee_id`**: `GET /api/notifications?user_id=<other>`, `GET /api/tasks?assignee_id=<peer>`, body `user_id`/`requester_id`/`decided_by`/`approved_by`/`owner_id` forgery. | Forced to `auth.uid()` scope; foreign values ignored/denied; attribution columns always server-set to caller where applicable. | No horizontal privilege escalation via parameter tampering (NOTIF-02, GOV-APR-02, AI-02 at API layer). | **P0** | List-filter + create/update-body variants. |
| API-07 | **Role escalation via API**: DEV calls admin-only operations (create project/team, promote role, send invite, write budget, decide approval/AI, delete others' docs/tasks). | `403` on every attempt; state unchanged. | API enforces matrix, not just UI hiding (frontend §9.2 is not a control). | **P0** | One case per matrix W/D cell marked ADMIN/PM-only; share helper with §6. |
| API-08 | **Method/route fuzz**: `POST/PUT/PATCH/DELETE` on read-only-today routes; unknown sub-paths; oversized pagination (`?limit=100000`), deep `?search=` injection strings. | Pinned `405`/validation errors; no stack traces; no unscoped fallback query. | Fail-closed routing + input validation (`src/schemas/**` Zod — validate all inputs per AGENTS.md). | **P1** | Include `action_label`/JSONB injection strings. |
| API-09 | **Consistency**: error format `{ success:false, error }` never leaks foreign-org existence, user emails, or SQL internals; `health` route exposes no data and requires no privilege. | Stable error contract; `health` returns `{ok}` only. | Information-disclosure minimization. | **P2** | Snapshot error bodies for anon/auth/cross-org/invalid. |

---

## 14. Storage Tests

> Buckets (final-spec §6.3): `project-documents` **private**, path `{project_id}/{folder_id}/{document_id}/{filename}`; `avatars` **public**, path `{user_id}/avatar.{ext}` (JPG/PNG/GIF ≤2MB). Metadata twins in §9. Until buckets exist, mark STOR prefixes `blocked-on-infra` — do not silently pass.

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| STOR-01 | **Document upload**: ADMIN/PM upload to own-org project path; member-DEV uploads to own project; DEV to foreign project / any cross-org path upload. | In-scope uploads succeed and create metadata row with matching `storage_path`/`project_id`; cross-org uploads denied at **both** Storage policy and metadata RLS. | Object path bound to project membership; metadata ↔ object sync (arch §9.3). | **P0** | Supabase Storage client per fixture JWT; assert object exists/absent + metadata row exists/absent. |
| STOR-02 | **Document read/download**: member reads own-project object (signed URL / policy pass); non-member same-org DEV, any cross-org user, and anon read Org B object. | Member succeeds; all others denied (no URL, no bytes). Old-version objects same rule. | No cross-project/org document leak (arch §10). | **P0** | Direct-URL + signed-URL + metadata-then-fetch variants; include `is_latest=false` object. |
| STOR-03 | **Document delete/overwrite**: ADMIN deletes; owner-DEV deletes own (per DOC-04 semantic); peer-DEV deletes/overwrites another's object; any cross-org delete; version-chain break (delete non-head leaving dangling `parent_version_id`). | Only authorized deletes succeed; object + metadata stay consistent (no orphan objects, no dangling versions). | Destructive + integrity control. | **P1** | Assert bucket listing + metadata chain after each attempt. |
| STOR-04 | **Avatar access**: user uploads/overwrites **own** `{user_id}/avatar.*` (valid type/size); uploads to **another** `{other_id}/avatar.*`; reads any avatar (public — allowed); uploads executable/oversize/invalid-type. | Own-write allowed; foreign-write denied; public read allowed; invalid uploads rejected. | Avatar isolation per user; public-read/private-write split (arch §9.2). | **P1** | Type/size matrix: JPG/PNG/GIF ≤2MB pass; EXE/SVG/HTML/>2MB deny. |
| STOR-05 | **Path-traversal & bucket confusion**: `../` segments, absolute paths, `storage_bucket` swap (`avatars` ↔ `project-documents`), `storage_path` pointing at foreign `project_id` while metadata says own. | All rejected; stored `storage_path` always matches metadata `project_id`/`folder_id`. | Object-key integrity; no bucket escape. | **P0** | Crafted-key upload + metadata-mismatch INSERT variants. |
| STOR-06 | **Metadata/object drift**: object without metadata row, metadata without object, `owner_id` ≠ uploader, `file_size`/`file_type` mismatch. | Upload flow is atomic (both or neither); mismatches rejected; orphan scan reports clean. | Sync invariant (arch §9.3). | **P2** | Attempt partial writes; run orphan-detection query as audit. |

---

## 15. Realtime & Service-Role Boundary Tests

| ID | Scenario | Expected result | Security requirement | Priority | Automation note |
|----|----------|-----------------|----------------------|----------|-----------------|
| RT-01 | Task-board realtime: DEV subscribed to own sprint's `tasks` sees own-project moves; subscription filtered to foreign `sprint_id`/Org B project yields nothing. | No cross-project realtime leak. | Realtime `sprint_id`/`project_id` filter (frontend §11.2). | **P1** | Tag `needs-realtime`; skip-with-reason until channels specified. |
| RT-02 | Activity-feed realtime: feed subscription without org/project filter receives nothing foreign. | Filtered delivery only. | Same as RT-01 for `activity_logs`. | **P2** | — |
| SRV-01 | `SUPABASE_SERVICE_ROLE_KEY` appears in no client bundle, no `NEXT_PUBLIC_*` var, no `src/app/**` client component, no `src/lib/**`, no committed `.env`. | Secret scan clean; service role used only in server/Edge paths (seed, triggers, admin flows). | Server-only secret (AGENTS.md Environment rule; arch §7). | **P0** | Static scan (`grep` for key name + `NEXT_PUBLIC` audit) in CI; manual bundle inspection on release. |
| SRV-02 | Every normal read/write path uses the **user JWT** (RLS applies); service-role client used only for allow-listed flows (signup trigger, invitation-accept join, admin provisioning, AI batch). | Code audit + runtime assertion: user-action queries carry `auth.uid()`; allow-list documented. | RLS-applies-by-default (arch §7). | **P0** | Runtime: log/claim-check which client served each API test in §13; fail if data route used service-role pool for user data (F2 regression gate). |

---

## 16. Priority Legend & Execution Order

| Priority | Meaning | Execute |
|----------|---------|---------|
| **P0** | Tenant-break or privilege-escalation risk. Ship-blocker. | First: AUTH-01/02/03/07, all ISO-01..15 + ISO-19/20/21, RBAC-PROJ-01/02 + RBAC-TASK-01/02 + RBAC-ROLE-01, TASK-DEV-01/02/03/06, MEMB-01/03, DOC-01/02, NOTIF-01/02, GOV-BUD-02 + GOV-APR-02, LOG-02, AI-02, API-01/02/03/05/06/07, STOR-01/02/05, SRV-01/02. |
| **P1** | Least-privilege / integrity / audit risk. Release-blocker for the owning surface. | Second: remaining AUTH, RBAC, DOC-03/04/05, NOTIF-03, PREF-01, GOV-*, LOG-01, AI-01, INV-01, API-04/08, STOR-03/04, RT-01. |
| **P2** | Defense-in-depth / consistency / anti-confusion. | Last: AI-03, API-09, STOR-06, RT-02. |

Suggested rollout mirrors auth-architecture §11: orgs+memberships → project/team scoping → trigger+invites → RLS on all tables → project refinements + DEV task rule → notifications/user scope → admin paths → storage → realtime → service-role audit → full plan pass.

---

## 17. Future Automation Approach

> Do not implement yet. This section tells the Testing/Database agents **how** to automate the plan without prescribing policy semantics.

### 17.1 Where tests live (per `tests/README.md` + AGENTS.md testing rules)

```
tests/
├── auth/
│   ├── auth.test.ts            # AUTH-01..08 (signup, trigger, invites, sessions, status)
│   ├── rls-policies.test.ts    # ISO-01..21 + MEMB-01..05 + LOG/AI/INV (direct-table RLS via user JWTs)
│   └── permissions.test.ts     # §3 matrix + RBAC-* + TASK-DEV-* + DOC-* + NOTIF-* + GOV-* (role × resource assertions)
├── database/
│   └── rls.test.ts             # Table-level ENABLE-RLS + policy-existence guard (fails if any business table lacks RLS or any policy is permissive-to-anon) + ISO spot-checks at SQL level
├── api/
│   ├── projects.api.test.ts    # API-01..09 scoped to projects (+ governance/docs routes once built: mirror files)
│   ├── tasks.api.test.ts       # …tasks (incl. TASK-DEV API twins + move/reassign endpoints)
│   ├── requirements.api.test.ts# …requirements/backlog
│   └── sprints.api.test.ts     # …sprints/board
├── storage/
│   └── storage-policies.test.ts# STOR-01..06 (proposed new dir; or tests/integration/storage.*)
├── fixtures/
│   ├── orgs.users.ts           # §2 aliases → seed UUIDs (adminA, pmA, devA1/2, adminB, multiDev, outsider, anon)
│   └── scope-helpers.ts        # resolveOrgProject(orgId), resolvePeerTasks(projectId), governanceTables(), genForeignIds()
└── utils/
    ├── auth-clients.ts         # getUserClient(fixture) (JWT), getServiceClient(), signUpTestUser(), setOrgRole()
    └── rls-assert.ts           # assertZeroRows(), assertDenied(), assertRowSet(), diffApiVsRls()
```

Unit tests for services stay co-located (`*.test.ts`); integration/RLS/API tests live in `tests/`; E2E (Playwright/Cypress) covers only the user-visible consequences (hidden projects, disabled buttons) — **never** as the sole authorization proof (UI hiding ≠ control).

### 17.2 Harness pattern (per test)

1. **Setup (service_role):** ensure orgs/users/memberships/projects/tasks/docs/governance rows exist (prefer pinned seed IDs; create ephemeral rows with `display_id`/`slug` suffixed `rls-test-<uuid>` for write tests, cleaned up after).
2. **Act (fixture JWT):** perform the single op under test (direct PostgREST/table query for RLS suites; `fetch` against route handler with `Authorization: Bearer <jwt>` for API suites; Storage client for STOR).
3. **Assert:** §-specified expectation (zero rows vs 401/403/404 vs RLS error). Re-read mutated rows via service_role to prove no-op on denies.
4. **Combinatorial expansion:** parameterize helpers over `{table × op × role}` (ISO-10/13 pattern) so adding a table (e.g. future `calendar_events`) is one list entry, not N new files.

### 17.3 Auth-context mechanics

- Prefer real Supabase Auth users + real JWTs (`signUp`/`signInWithPassword` in `setup.ts`, cached per fixture; `outsider` = fresh user with no memberships; `anon` = `supabase.auth` without session).
- Where service-level SQL is needed, use transaction-scoped impersonation (`SET LOCAL role TO authenticated; SET LOCAL request.jwt.claims TO '{"sub":"<user_id>"}'`) so `auth.uid()` resolves exactly as in production — never stub the predicate.
- Every test file starts with a **precondition guard**: assert RLS is enabled on touched tables and the signup trigger exists; if not, fail with `blocked-on-infra` (not silent pass) so F1/F3/F4 stay visible until fixed.

### 17.4 Data & determinism

- Read-only suites run against the committed seed (3 orgs) for determinism; write suites use ephemeral `rls-test-*` rows inside rolled-back transactions or with explicit teardown (FK-safe order per `scripts/seed.cjs` dependency order).
- Multi-membership users (e.g. `21f08f45…`, `4aa24f06…`) are **excluded** from pure-isolation negatives — dedicated `outsider` covers those; `multiDev` covers the blended positive.
- CI: `test:integration` runs RLS + API + storage suites against a throwaway Supabase project (migrations `0000`+`0001` applied, seed loaded); `rls.test.ts` policy-existence gate runs before the matrix so missing RLS fails fast with a clear message.

### 17.5 Coverage gates for sign-off

- 100% of §3 matrix cells have ≥1 automated case; 100% of P0 cases automated and green; all `blocked-on-infra` tags resolved (RLS on, trigger live, buckets live) before release; static SRV-01 scan green; API-vs-RLS diff (API-02) green for every entity route.

---

## 18. Traceability Checklist

| Requirement (prompt) | Covered by |
|----------------------|------------|
| Supabase Auth (signup, trigger, invites, sessions, status) | AUTH-01..08 |
| Organization isolation SELECT/INSERT/UPDATE/DELETE | ISO-01..21 (direct-org §5.1, project-derived §5.2, user-scoped §5.3) |
| Roles ADMIN / PROJECT_MANAGER / DEVELOPER (exactly three, org-scoped) | §3 matrix + RBAC-PROJ/REQ/SPR/TASK/BACK/TEAM/ROLE/INV/USER |
| Project access | RBAC-PROJ-*, MEMB-01..03, ISO-03/05/06/10..12 |
| Team access | RBAC-TEAM-*, MEMB-04, ISO-03/05 |
| Task access + developer-other-task rule | RBAC-TASK-*, TASK-DEV-01..09 |
| Documents | DOC-01..06 + STOR-01..03/05/06 |
| Notifications | NOTIF-01..03 + PREF-01, ISO-19 |
| Governance (budgets, contracts, approvals, risks, change requests, milestones) | GOV-BUD/CON/APR/RISK/CHG/MILE + ISO-13 |
| API authorization (unauth, auth, cross-org IDs, invalid IDs, manipulated org/user IDs, escalation) | API-01..09 |
| Storage (upload, read, delete, avatars) | STOR-01..06 |
| Permission matrix (projects, requirements, sprints, tasks, teams, documents, risks, contracts, budgets, approvals, change requests, milestones, notifications) | §3 + §6 + §11 |
| Per-test expected result + security requirement + priority + automation approach | Every row + §16 + §17 |

---

## 19. Open Questions Blocking Test Sign-Off

Pinned from auth-architecture §12 and final-spec uncertainties — each needs a product/schema decision, after which the tagged test flips without restructuring:

1. **PM invitation rights (v1):** RBAC-INV-01 / INV-01 assert PM-send **denied** (DEFER default). If granted, flip to allow + add PM-revoke tests.
2. **Project deletion scope:** RBAC-PROJ-03 asserts PM deletes **own-created only**. If ADMIN-only, tighten.
3. **DEV requirement/task create semantics:** TASK-DEV-04 / RBAC-REQ-02 assert self-assigned-create allowed-in-member-project; if DEV create is fully denied, flip own-variant to deny.
4. **DEV read scope (non-member same-org project):** MEMB-01 asserts **hidden**. If org-wide DEV read is intended, this becomes the largest scope expansion — requires explicit sign-off + RLS predicate change.
5. **Governance DEV create (risks/changes):** GOV-RISK-01 / GOV-CHG-01 assert DEV **create-only**. If read-only, tighten.
6. **`users.role` resurrection:** must stay removed. Any reintroduction reopens dual-authority confusion (final-spec U1) and invalidates §3 — reject unless accompanied by a full matrix revision.
7. **Documents project context:** DOC suite assumes project-scoped (final-spec U8). A future org-wide document center needs new tests (nullable `project_id` + global-read cases).
8. **`last_active_at` update path:** if updated on every request, add a test that read-path writes cannot be abused for cross-org writes (currently out of scope per final-spec §2.2 uncertainty).

---

*End of plan. Implementation (fixtures, `tests/auth/*`, `tests/database/rls.test.ts`, `tests/api/*`, storage suites) is explicitly out of scope for this document.*
