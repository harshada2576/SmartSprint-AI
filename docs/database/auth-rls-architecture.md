# Auth & RLS Architecture — SmartSprint AI

Architectural evidence for authentication, authorization, and Row Level Security.
This is a design/audit document only. It specifies **what** the security model should be and which schema changes are required. It does **not** implement RLS policies or schema changes — those are left to the schema-finalization and Database agents.

Generated: 2026-09-02
Status: PROPOSAL (input to schema-finalization)

---

## 1. Scope

This document is authored by the **Auth & RLS Architect** and covers:

- The authentication model (Supabase `auth.users` → application `users`)
- The organization & membership model (multi-tenancy)
- The authorization matrix (what each role may do)
- The Row Level Security architecture
- Service-role usage boundaries
- Storage authorization strategy
- Security risks
- Required schema changes (classified KEEP / MODIFY / REMOVE / DEFER)

It relies on two sources of truth, already inspected:

- `docs/database/frontend-data-mapping.md` (the UI/data audit)
- `supabase/schema.ts` (the current DB schema; single source of truth)

---

## 2. Current-State Findings (evidence)

### 2.1 What already exists

Inspected `supabase/schema.ts` (316 lines) and `supabase/migrations/0000_initial_schema.sql`:

| Item | Status | Evidence |
|------|--------|----------|
| `user_role` enum = `ADMIN`, `PROJECT_MANAGER`, `DEVELOPER` | **Exists, correct** | `schema.ts:13` — exactly the three required roles; no extra roles |
| `users.id` is the PK and FKs to `auth.users.id` (cascade) | **Exists** | `schema.ts:32-49`, `0000_initial_schema.sql:174` |
| `users.email` unique, `users.first_name`, `last_name`, `department`, `avatar_initials`, `status` | **Exists** | `schema.ts:34-40` |
| `users.role` global column with default `DEVELOPER` | **Exists** | `schema.ts:37` |
| `project_members`, `team_members` join tables | **Exists** | `schema.ts:300-316`, `283-298` |
| `invitations` table with `email`, `role`, `status`, `invited_by` | **Exists** | `schema.ts:17-30` |
| RLS policies | **NONE** | No `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` in `0000_initial_schema.sql` |
| Signup trigger (auth.users → users profile) | **NONE** | Not present |
| Organizations / multi-tenancy | **NONE** | No `organizations` table |
| Storage buckets / policies | **NONE** | No Supabase Storage configured |
| `auth.users` linking for realtime/RLS helpers | **NONE** | No `auth.uid()` usage yet |

### 2.2 Confirmed schema gaps relevant to security (from the data audit)

From `docs/database/frontend-data-mapping.md` §12:

- `organizations` table — missing (`12.1`)
- `users.organization_id` — missing column (multi-tenancy, `12.2`)
- `users.job_title`, `users.avatar_url`, `users.last_active_at` — missing columns (`12.2`)
- Organization settings (name, url, industry, timezone) — missing (`3.17`, `12.1`)

---

## 3. Authentication Model

### 3.1 Recommended flow

```
Supabase Auth (auth.users)              ← authentication source of truth
        │  id is also users.id
        ▼
application users table (public.users)  ← profile + application role
```

Recommended architecture:

- **Supabase Auth is the single authentication identity provider.** Use email/password (native Supabase Auth). Optionally enable third-party providers later (DEFER).
- **`public.users.id` MUST equal `auth.users.id`.** The current FK (`users_id_fkey` → `auth.users.id` ON DELETE CASCADE) already enforces this. **KEEP.**
- **`public.users` is the application profile.** All role, membership, and profile attributes live here (not in `auth.users`, which is Auth-managed).
- A **post-signup trigger/function** populates `public.users` when an `auth.users` row is created (via `auth.handle_new_user` or an Edge Function):
  - `id := NEW.id` (from `auth.users`)
  - `email := NEW.email`
  - `first_name` / `last_name` parsed from optional metadata
  - defaults: `role := 'DEVELOPER'`, `status := 'active'`
  - This trigger is **required** (Schema requirement — DEFER implementation to Database/Edge agents).
- **No client-side signup of roles.** A user signs up as a DEVELOPER by default. Promoting to PROJECT_MANAGER/ADMIN is an **admin action** in the same organization (see §4.4 role escalation controls).

### 3.2 Sign-up vs organization membership

The Register page (`frontend-data-mapping.md` §3.20) implies "organization creation". Two paths:

1. **User creates the first organization** (e.g., account signup) → becomes its ADMIN.
2. **User accepts an invitation** (`invitations` table) → joined to an existing organization with the invited role.

This means organization membership must be established **either** at first-org creation **or** via membership/invitation — never implicit.

---

## 4. Organization & Membership Model

### 4.1 Multi-tenancy recommendation

**Decision: Support multiple organizations, do NOT force single-org.**

Rationale: the data audit does not justify restricting a user to one org, and forcing single-org would require justifying an artificial constraint. However, SmartSprint's UI is currently org-scoped (dashboard, settings). Recommended model:

- **KEEP the concept of global `user_role`** (ADMIN / PROJECT_MANAGER / DEVELOPER) to match the frontend role model.
- **ADD organization membership with an org-scoped role.** The effective role within a given organization must be derived from the **membership**, not from the global `users.role` column.

This introduces a distinction between:

- **Global role** (`users.role`) — currently the only role source. In a multi-org model this becomes ambiguous.
- **Org-scoped role** (`organization_members.role`) — the authority for permissions *within* an organization.

**Recommendation (MODIFY):** Introduce an `organization_members` table carrying the org-scoped role, and treat `users.role` as either (a) the org-scoped role of the *primary/default* organization, or (b) a legacy/denormalized value. See §8 for the exact schema change and the ambiguity it resolves.

### 4.2 Concrete membership model

```
organizations
   │ 1
   ▼
organization_members (user_id, organization_id, role)   ← primary scoping unit
   │
   ├── projects (each project belongs to one organization via organization_id)
   │      └── project_members (project_id, user_id, [role])
   │
   ├── teams (each team belongs to one organization via organization_id)
   │      └── team_members (team_id, user_id)
   │
   └── invitations (targets an organization)
```

Rationale: A user belongs to many orgs (`organization_members`). Within each org they belong to projects (`project_members`) and teams (`team_members`). Projects and Teams are **organization-scoped** (add `organization_id`), which is the cleanest way to prevent cross-org leakage.

### 4.3 Project & team membership roles (avoid role proliferation)

The instruction says do not add application roles. Project-membership and team-membership roles (e.g., project.admin / PM) would **proliferate roles**. Recommended approach:

- **Do NOT add project-level or team-level role enums.**
- A user's effective ability within a project is derived from their **organization-scoped role** (`organization_members.role`).
- `project_members` / `team_members` remain **membership-only** join tables (no role column). If finer-grained project authority is ever needed, it is **DEFER**red and should be expressed via grant/role mapping in the org role, not new roles.

This keeps exactly three application roles as required.

### 4.4 Effective-permission resolution order

For any resource, resolve the acting role as:

```
authenticated user (auth.uid())
      │
      ▼
organization_members(organization_id = resource.organization_id)
      │  role = ADMIN | PROJECT_MANAGER | DEVELOPER
      ▼
project_members / team_members  (optional tightener for membership-scoped reads)
```

- **Membership is required.** A user who is not an `organization_members` row for `resource.organization_id` has **no access**, regardless of global role.
- The UX matrix (`frontend-data-mapping.md` §9.2) has DEVELOPER able to see "their projects" — this is satisfied by membership, not by global role.

---

## 5. Authorization Matrix

Scope note: this matrix combines the UI expectations (`frontend-data-mapping.md` §9.2) with a secure underlying model. **R** = Read, **W** = Write (create/update), **D** = Delete. Where stricter controls exist, they are marked.

Effective role is the **org-scoped** role of the acting member.

| Resource | ADMIN | PROJECT_MANAGER | DEVELOPER |
|----------|-------|-----------------|-----------|
| **Organizations** (own org) | R/W | R | R (own membership only) |
| Org settings / billing | R/W | — | — |
| **Users** (org directory) | R/W (create, promote/demote, deactivate) | R (view team/project members) | R (self + teammates) |
| Role assignment / promotion | W (ADMIN only) | — | — |
| Invitations | R/W (send, revoke) | W (send for managed project — DEFER; default R/W for org invites ADMIN only) | — |
| **Projects** | R/W/D | R/W (managed/all per policy), D (own) | R (member) |
| Project creation | W | W | — |
| **Requirements** | R/W/D | R/W (all in org) | R (own project); W on own assigned items (DEFER per policy) |
| **Sprints** | R/W/D | R/W | R (member) |
| Sprint planning / capacity | W | W | — |
| **Tasks** | R/W/D | R/W | R (project); W (tasks assigned to self) |
| Task assignee changes | W | W | — (cannot reassign others) |
| **Teams** | R/W/D | R (view) | R (view own team) |
| Team membership | W (ADMIN) | — | — |
| **Documents** | R/W/D | R/W (project docs) | R (project docs); W (upload to own project) |
| **Governance** (budget, contracts, approvals, risks, change requests) | R/W/D | R/W (approvals, risks, changes), R (budget); write-budget ADMIN-only | R (view relevant) |
| **Notifications** | R (own) / W (system) | R (own) | R (own) |
| **AI predictions** | R/W (approve/apply) | R/W (approve/apply) | R (own project) |
| Dashboard/Reports/Monitoring | R (org-wide) | R (org/project) | R (own project/team scope) |

### 5.1 Key authorization rules

1. **Cross-org is forbidden.** No resource is ever readable/writable across organizations.
2. **Membership gates reads.** Even ADMIN cannot read another org's data.
3. **Self-tasks rule.** DEVELOPER may write only tasks where `assignee_id = auth.uid()` (and within their membership).
4. **Role promotion is ADMIN-only.** No self-escalation; no PM→ADMIN.
5. **Deletions are ADMIN-or-owner.** Destructive operations restricted.

---

## 6. RLS Architecture

### 6.1 Core principle

```
authenticated user (auth.uid())
       ↓
organization membership (auth.uid() ∈ organization_members[org])
       ↓
resource ownership / membership (resource.organization_id = member org)
       ↓
allowed row returned via policy
```

### 6.2 Which tables need organization-scoped policies

Every table that carries or can derive an `organization_id` and represents business data must be guarded by an org-scoped policy.

| Table | Scope | Guard expression sketch |
|-------|-------|-------------------------|
| `users` | org | `EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id = auth.uid() AND om.organization_id = users.organization_id)` |
| `organizations` / `organization_members` | org | member can read own memberships; org row readable if `auth.uid()` is a member of it |
| `projects` | org (via `projects.organization_id`) | member of that org |
| `requirements` | project → org (via `requirements.project_id.organization_id`) | member of project's org (and optionally project membership) |
| `sprints` | project → org | same |
| `tasks` | project → org | same; **plus** developer write limited to own `assignee_id` |
| `backlog` | project → org | same |
| `teams` | org | member of org |
| `team_members` / `project_members` | org | member of org (via project/team org) |
| `ai_predictions` | project (via `ai_predictions.requirement_id.project_id`) → org | same |
| `activity_logs` | project → org | same |
| `notifications` | **user** | `notifications.user_id = auth.uid()` (user-scoped, not org) |
| `invitations` | org | ADMIN of target org (or PM per DEFER) |
| Governance tables (budget/contracts/risks/change_requests/approvals, when added) | project → org | member of org; writes restricted by role |

### 6.3 Which tables need project-scoped policies

Project-scoped policies are a **refinement on top of** org scoping. They matter for **membership-tightened** access and for the DEVELOPER self-write rule:

- `requirements`, `sprints`, `tasks`, `backlog`, `ai_predictions`, `activity_logs`, governance tables: after the org check passes, project-scoped rules refine it:
  - DEVELOPER can write **own assigned tasks** only.
  - READ access is membership-based (member of the project, or member of the org).

### 6.4 Policy skeleton (illustrative — NOT implemented)

RLS is a two-step enablement per table:

```sql
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
```

Then policies such as:

```sql
-- org read
CREATE POLICY "projects_org_read" ON "projects"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members om
            WHERE om.user_id = (SELECT auth.uid())
              AND om.organization_id = projects.organization_id)
  );
```

These skeletons are for the Database agent's reference. No policy is created by this document.

### 6.5 Delegated access for functions (SECURITY DEFINER)

- Edge Functions / Server Functions that must cross RLS (e.g., AI evaluation, admin provisioning) use `SECURITY DEFINER` or the service role — **not** the user's token. See §7.

---

## 7. Service-Role Boundaries

The Supabase service role bypasses RLS. Rules:

| Allowed (server/Edge only) | Forbidden |
|----------------------------|-----------|
| Edge Functions admin operations (AI pipeline, cross-org batch ops) | In browser/frontend code |
| Server-side seed / provisioning (creating orgs, first ADMIN) | In `NEXT_PUBLIC_*` env vars |
| Auth trigger handlers (create `public.users` on signup) | Exposed to any client bundle |
| Invitation acceptance flows that need to bypass RLS to join an org | `SUPABASE_SERVICE_ROLE_KEY` in frontend |
| Data migration / backfill | Realtime subscriptions using service role |

**Hard rule:** `SUPABASE_SERVICE_ROLE_KEY` is a **server-only** secret. It must live in server/Edge Function code (`supabase/functions/**`, `src/api/**` server-side) and in server environment variables only. It must never appear in `src/lib/**`, `src/app/**` client components, or any `NEXT_PUBLIC_` variable. (Matches `AGENTS.md` Environment/Secrets rule.)

Use the **user-provided JWT** (`auth.uid()`) for all normal application reads/writes so RLS applies.

---

## 8. Required Schema Changes (KEEP / MODIFY / REMOVE / DEFER)

These are **inputs for the schema-finalization agent**. Not implemented here.

### KEEP

| Change | Rationale |
|--------|-----------|
| `user_role` enum (`ADMIN`/`PROJECT_MANAGER`/`DEVELOPER`) | Exact required roles; no extra roles |
| `users.id` FK → `auth.users.id` ON DELETE CASCADE | Core auth link; keep |
| `users.email` unique | Identity |
| `project_members`, `team_members` join tables | Membership scaffolding (extend, see MODIFY) |
| `invitations` table | Invite-to-org flow |

### MODIFY

| Change | Rationale |
|--------|-----------|
| **Add `organizations` table** (id, name, url, industry, timezone, created_at, updated_at) | Missing multi-tenancy root (`frontend-data-mapping.md` §12.1, §3.17) |
| **Add `organization_members` join table** (user_id, organization_id, role) with org-scoped role, PK (user_id, organization_id) | The primary scoping unit; carries the org role |
| **Add `projects.organization_id`** FK → organizations | Org-scope projects for RLS |
| **Add `teams.organization_id`** FK → organizations | Org-scope teams |
| **Add `projects.manager_id` remains; add membership check** | manager should be an `organization_members`/`project_members` row |
| **Add `users.organization_id`** FK → organizations | Denormalized "primary org" pointer; resolves global-role ambiguity for single-org-per-user UX and `users.role` display |
| **Add `users.last_active_at`, `users.avatar_url`, `users.job_title`** | Data-audit gaps (`12.2`) |
| **Add signup trigger** `auth.users` → `public.users` profile | Ensure every auth user has a profile row |
| **Add `ai_predictions.approved_by`, `approved_at`** | AI recommendation approval trail (data audit `12.2`, §3.15) |
| Add org id to join tables (denormalized) for RLS efficiency | `project_members.org_id`, `team_members.org_id` if / where audits show a need |

### REMOVE

| Change | Rationale |
|--------|-----------|
| *(None forced at this stage)* | The schema is early; no destructive removal justified yet |
| Reconsider: keep `users.role` only as a **display/legacy** column, not an authorization source | Flag: if the final model formalizes org-scoped roles, `users.role` must not gate authorization. Reviewer to confirm before implementing |

### DEFER

| Change | Rationale |
|--------|-----------|
| `organizations` billing/subscription columns | Not required by frontend |
| Third-party auth providers | Not required |
| Project-level / team-level role enums | Would proliferate roles; use org role |
| Granular "permission" tables (role→permission mapping) | Not required by UI; hardcode policy logic per role |
| Admin audit-log UI on auth events | Not in frontend; service logs suffice |
| `organizations.created_by`, technical policy on `organization_members` for own-creation | Confirm with schema agent |

---

## 9. Storage Security Strategy

From `frontend-data-mapping.md` §10, SmartSprint needs:

- **Project documents** (PDF, DOCX, PNG, MD, XLSX) — org/project scoped
- **User avatars** (JPG, PNG, GIF, ≤2 MB) — user scoped
- Exports/downloads are generation features, not storage

### 9.1 Storage layout

```
/smart-sprint/{organization_id}/{project_id}/documents/...
/avatars/{user_id}.{ext}
```

### 9.2 Storage RLS (Supabase Storage policies — illustration only)

Storage object paths are checked with `storage.foldername` / `storage.extension`:

- **Avatars bucket:** user can read/write only `avatars/{auth.uid()}/`; SRP can read any.
- **Documents bucket:** path includes `{org_id}/{project_id}`; policy `USING ((SELECT auth.uid()) IN org/project membership)`.

### 9.3 Storage + metadata

- **Objects in Storage + metadata rows in the (to-be-added) `documents`/`folders` tables** (see `frontend-data-mapping.md` §12.1). Object key should mirror the DB `documents` foreign keys (`organization_id`, `project_id`).
- The metadata table enforces project scoping via RLS; the Storage bucket policy must stay in sync with the same org/project membership predicate.

---

## 10. Security Risks & Mitigations

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Cross-organization access** | A user reading/writing another org's projects, users, documents | Every org-scoped table has an org-membership policy; no policy bypass |
| **Cross-project access** | A user reading another project within their org they're not on | Project-scoped read policies + DEVELOPER self-task write rule |
| **Role escalation** | DEVELOPER/PM promoting themselves or others | Role change policies ADMIN-only; no self grants; separate `organization_members` policy mutating path |
| **Direct-table access** | Browser hitting `projects`/`users` tables directly | RLS enabled on all tables; never disable RLS on public tables; no `bypassrls` for anon |
| **Storage authorization** | Downloading another org's documents | Storage-path policies + sync with metadata RLS; avatars isolated per user |
| **Service-role leakage** | `SUPABASE_SERVICE_ROLE_KEY` in bundle | Server-only secret; never in `NEXT_PUBLIC_`; Edge/server functions only |
| **Realtime leak** | Postgres Realtime subscription without org filter | Realtime `user_id` filter (notifications) & org/project filter on tables |
| **Orphaned profile** | auth user without `users` row | Signup trigger guarantee; fail-closed RLS (no row → no access) |
| **Enum/role mixups** | `users.role` vs org role drift | Document org role as source of truth; deprecate legacy use |

---

## 11. Recommended Implementation Order

The final agent should implement in this order (each step keeps the system secure end-to-end):

1. **`organizations` table + `organization_members` table** (with org-scoped role).
2. **Link `projects.organization_id`**, `teams.organization_id`, and **`users.organization_id`** (primary-org pointer).
3. **Signup trigger** (`auth.users` → `public.users`) + profile defaults; invitation flow writing `organization_members`.
4. **Enable RLS** on **all** business tables.
5. **Org-scoped SELECT/INSERT policies** for every org table (projects, requirements, sprints, tasks, backlog, teams, team_members, project_members, activity_logs, ai_predictions, governance).
6. **Project-scoped refinements** (membership reads; DEVELOPER own-task writes).
7. **Notification user-scoped policies** (`notifications.user_id = auth.uid()`).
8. **Administrative policies** (role promotion ADMIN-only; invitation ADMIN/PM; deletions owner/admin).
9. **Storage buckets + policies** (avatars, documents) in sync with metadata table RLS.
10. **Realtime filters** (org/user-scoped subscriptions).
11. **Service-role audit** — ensure `NEXT_PUBLIC_*` contains no secrets; document SRP usage.
12. **Security test pass** — cross-org/cross-project/RLE test vectors in `tests/auth/`.

---

## 12. Open Questions / Uncertainties (explicitly flagged)

These are intentionally **not** resolved here; they need confirmation from the schema-finalization or Database agent:

1. **`users.role` or `organization_members.role` is authoritative?** Recommended: org-scoped role is the authorization authority; `users.role` becomes the *primary-org* denormalized display. Confirm.
2. **Single-org vs multi-org enforcement** — the UI is org-scoped (dashboard/settings), but multi-org membership is preferred and harmless. Confirm whether to enforce one primary org for the first release.
3. **PM invitation rights** — matrix marks PM org-invites as DEFER; confirm ADMIN-only org invites for v1.
4. **Deletion policy nuance** — confirm "ADMIN or owner" on projects vs ADMIN-only.
5. **`project_members`/`team_members` denormalized `organization_id`** — confirm whether RLS efficiency requires it or whether joins are acceptable.
6. **Governance write scoping** — whether DEELOP-members may create risks/change requests (matrix says R only) — confirm with product intent.
