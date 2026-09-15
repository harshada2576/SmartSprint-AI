# API Security & Supabase Integration Review — SmartSprint AI

> **Role:** API Architecture and Security Agent
> **Type:** Analysis only. No source code was modified.
> **Date:** 2026-09-09
> **Sources inspected:** `src/app/api/**/route.ts` (8 routes), `src/repositories/**` (7 files),
> `src/db/index.ts`, `supabase/client.ts`, `supabase/schema.ts` (637 lines),
> `supabase/migrations/0000_initial_schema.sql`, `supabase/migrations/0001_add_organizations_and_governance.sql`,
> `supabase/migrations/meta/*.json` (`isRLSEnabled: false` on all tables),
> `src/app/dashboard/page.tsx`, `docs/database/auth-rls-architecture.md`,
> `docs/database/frontend-data-mapping.md`, `package.json`, `tsconfig.json`,
> `.env.example`, `drizzle.config.ts`
>
> **Out of scope (not done here, per brief):** frontend redesign, RLS policy
> implementation, schema modification, data seeding.
>
> **Update 2026-09-09 (Auth foundation landed in parallel):** Supabase Auth is
> now implemented — email/password + Google OAuth, session proxy (`proxy.ts`),
> login/register/forgot/reset pages, and auth→app provisioning
> (`src/lib/auth/organization.ts`). `@supabase/supabase-js@2.116.0` and
> `@supabase/ssr@0.12.7` are now installed. Statements below marked
> **[STALE — see update note]** describe the pre-auth state; the update notes
> give the current state. The API/repository layer itself is still
> unauthenticated — every finding about `/api/*` and repositories stands.

---

## 1. Current API architecture

### 1.1 Request path (as built)

```text
Browser (mock data — no fetch to /api/* yet)
   ↓  (future)
Next.js API Route  (src/app/api/*/route.ts — GET only, no auth, no validation)
      ↓
Repository  (src/repositories/*.repository.ts — single getAll*() each)
      ↓
Drizzle ORM over node-postgres Pool  (src/db/index.ts, DATABASE_URL)
      ↓
PostgreSQL / Supabase Postgres (direct connection, RLS disabled)
```

There is **no service layer in the request path**: `src/services/` and `src/schemas/`
exist as directories with only `README.md` files — no code. Validation (Zod),
DTO mapping, and business rules do not exist yet.

### 1.2 The two Drizzle clients (redundant privileged connections)

| File | Import specifier | Transport | Credential | SSL |
|------|------------------|-----------|------------|-----|
| `src/db/index.ts` | `../db` (relative) | `drizzle-orm/node-postgres` + `pg.Pool` | `DATABASE_URL` | `rejectUnauthorized: false` |
| `supabase/client.ts` | `@supabase/client` (via `tsconfig.json:25` path alias `@supabase/* → ./supabase/*`) | `drizzle-orm/node-postgres` + `pg.Pool` | `DATABASE_URL` | none |

Key facts:

- Both files export an identically-shaped `{ pool, db }` built on the **same
  privileged `DATABASE_URL`**. Neither accepts or forwards a user JWT.
- 6 of 7 repositories import `../db` (`src/db/index.ts`); `/api/health`
  (`src/app/api/health/route.ts:1`) imports `@supabase/client`
  (`supabase/client.ts`). There is no functional difference today — both bypass RLS.
- **No `@supabase/supabase-js` or `@supabase/ssr` dependency exists**
  (`package.json:11-25`). **[STALE — update 2026-09-09: both are now installed
  (`@supabase/supabase-js@2.116.0`, `@supabase/ssr@0.12.7`) for the Auth
  foundation: browser client `src/lib/supabase/client.ts`, server client
  `src/lib/supabase/server.ts`, session helper `src/lib/supabase/proxy.ts`,
  route gate `proxy.ts`. These serve page-session auth, NOT the API data
  path — no route or repository uses them yet.]** There is no `createClient`, `getUser`, `getSession`,
  cookie handling, or anon-key usage anywhere in `src/` or `supabase/`.
  The name `supabase/client.ts` is therefore misleading: it is a second
  privileged Drizzle pool, not an authenticated Supabase client.
- `DATABASE_URL` is almost certainly a superuser / service-role-equivalent
  connection string (direct `pg.Pool`, no `options`/role switching, no
  `SET LOCAL ROLE`, no `SET request.jwt.claims`). Every query runs with full
  table access.

### 1.3 Route inventory (all GET-only, all unauthenticated)

| Route file | Handler | Repository call | Query params | Body | Methods |
|------------|---------|-----------------|--------------|------|---------|
| `src/app/api/projects/route.ts:4` | `GET()` | `getAllProjects()` | none | n/a | GET only |
| `src/app/api/requirements/route.ts:4` | `GET()` | `getAllRequirements()` | none | n/a | GET only |
| `src/app/api/sprints/route.ts:4` | `GET()` | `getAllSprints()` | none | n/a | GET only |
| `src/app/api/tasks/route.ts:4` | `GET()` | `getAllTasks()` | none | n/a | GET only |
| `src/app/api/backlog/route.ts:4` | `GET()` | `getAllBacklogItems()` | none | n/a | GET only |
| `src/app/api/ai-recommendations/route.ts:4` | `GET()` | `getAllAIRecommendations()` | none | n/a | GET only |
| `src/app/api/notifications/route.ts` | — (0-byte file) | `getAllNotifications()` exists but is **unwired** | — | — | broken stub |
| `src/app/api/health/route.ts:6` | `GET()` | `db.execute(sql`select 1`)` | none | n/a | GET only |

No route reads headers, cookies, search params, or request bodies. No route
returns 401/403/404/422 — only 200 (`{success:true, data}`) or 500
(`{success:false, error}`), except `/api/health` which uses a different
envelope (`{ok:true/false}`, §7).

### 1.4 What the frontend actually consumes today

`src/app/dashboard/page.tsx:1` is `"use client"` and renders **entirely from
hardcoded mock arrays** (`stats`, `recentProjects`, `recentActivity`,
`projects` — lines 36–136). A repo-wide search finds **zero `fetch()` calls to
`/api/*`** and zero Supabase calls from components. The API layer is therefore
currently **dead code from the UI's perspective** — which is good: it means the
auth retrofit can happen before any client depends on the insecure shape.

The canonical UI data requirements are documented in
`docs/database/frontend-data-mapping.md` (§3–§8) and summarized for the
dashboard in §7 below.

---

## 2. Current security weaknesses

> Severity scale: **CRITICAL** = remotely exploitable data breach path once
> deployed/connected; **HIGH** = tenant-isolation failure under the target
> multi-org model; **MEDIUM** = hardening/robustness gap.

### 2.1 W1 (CRITICAL) — Every data endpoint is an unauthenticated full-table dump

Each of the six working routes calls an unbounded `SELECT * … ORDER BY
created_at DESC` with no `WHERE`, no `LIMIT`, no auth check. Example
(`src/repositories/project.repository.ts:5-10`):

```ts
export async function getAllProjects() {
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}
```

Once the frontend (or any anonymous HTTP client) calls these routes, **any
caller receives every row in the table across all organizations**. There is no
session, no `user_id`, no `organization_id` filter at either the route or
repository layer.

### 2.2 W2 (CRITICAL) — Privileged connection silently bypasses RLS by design

Both `src/db/index.ts:14-21` and `supabase/client.ts:14-18` connect with
`DATABASE_URL` as a fixed server identity. Even after RLS policies are written
(future work), **these connections will keep bypassing them**, because:

1. `node-postgres` Pool connections authenticate as the database role embedded
   in `DATABASE_URL` (typically `postgres` or equivalent superuser), not as the
   end user; and
2. no per-request `SET LOCAL ROLE authenticated` / `SET LOCAL
   "request.jwt.claims"` (or Supabase `auth.uid()` context) is ever issued.

This is exactly the anti-pattern called out in the brief. Any future
authenticated feature built on the current `db` object inherits the bypass
silently — the code will *look* secure (route → repository → ORM) while RLS
never fires. Verified: no `auth.uid()`, `request.jwt`, `set_config`, or
`authenticated` role reference exists in `src/` or `supabase/migrations/*.sql`.

### 2.3 W3 (CRITICAL) — No RLS is enabled anywhere

`supabase/migrations/meta/0000_snapshot.json` and `0001_snapshot.json` report
`"isRLSEnabled": false` on **every** table, and neither migration SQL file
contains `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY`. Defense in depth is
zero: a leaked `DATABASE_URL`, a SQL-injection flaw, or a directly-exposed
PostgREST/Supabase Data API would expose all tenant data. (RLS authoring itself
is out of scope here; the design proposal lives in
`docs/database/auth-rls-architecture.md` §6.)

### 2.4 W4 (HIGH) — No organization or user scoping exists in code

| Dimension | Status |
|-----------|--------|
| Route-level `organization_id` / `project_id` / `user_id` parsing | absent — handlers take no arguments |
| Repository method parameters | absent — all seven `getAll*()` take zero arguments |
| Joins constraining to caller's org (`organization_members`, `project_members`) | absent |
| `users.id ↔ auth.users.id` usage at request time | absent (FK exists in schema, never consulted) |

The schema *does* now carry the needed scoping columns (`projects.organization_id`
per `supabase/schema.ts:99-101`, `organization_members` per lines 40–58,
`project_members` per lines 365–381) after migration `0001`, but **no query
references them**.

### 2.5 W5 (HIGH) — Notifications are user-scoped data served (when wired) as global

`notifications` (`supabase/schema.ts:329-346`) is keyed by `user_id` with no
`organization_id`. The repository (`notification.repository.ts:5-9`) selects all
rows for all users. Wiring the current stub to the current repository would
immediately leak every user's notifications to every caller. Per
`auth-rls-architecture.md` §6.2 this table needs a **user-scoped** policy
(`user_id = auth.uid()`), not an org-scoped one — the API must pass the caller
identity through (§4).

### 2.6 W6 (HIGH) — Transitive org leakage through second-hop tables

`requirements`, `sprints`, `tasks`, `backlog`, and `ai_predictions` carry no
`organization_id`; their org is derived via `project_id → projects.organization_id`
(`ai_predictions` is two hops: `requirement_id → project_id → organization_id`).
Unscoped `getAll*()` queries therefore leak cross-org data even if `projects`
itself were later filtered. Any future filter must be applied at the
repository level through the join chain, not assumed from a parent query.

### 2.7 W7 (MEDIUM) — `/api/notifications/route.ts` is a 0-byte broken stub

The file exists but is empty. Next.js treats it as a route with no handlers
(405/404 behavior depending on version). The matching repository function
`getAllNotifications()` is dead code. Risk is low today (fails closed), but the
route is listed in the brief as "current API" — it must be rebuilt with
user-scoping (§8), not simply filled in with the global pattern.

### 2.8 W8 (MEDIUM) — Inconsistent error/response envelope + verbose 500s

Six routes return `{success, data}` / `{success:false, error}` while
`/api/health` returns `{ok}`. `console.error` logs raw errors server-side and
all failures collapse to generic 500s. There is no 400/401/403/404 taxonomy
(see §7 for the recommended contract that preserves the existing envelope).

### 2.9 W9 (MEDIUM) — No validation, no pagination, no filtering → abuse + DoS surface

No query-param parsing means no injection sink *today*, but also no `LIMIT`:
`SELECT *` over `tasks`/`activity_logs` grows unboundedly. `frontend-data-mapping.md`
§7 already specifies the required `?status=&search=&page=&limit=` shapes — none
are implemented. Adding them later without auth would widen the dump (filtered
dumps are still dumps).

### 2.10 W10 (LOW, note) — `ssl: { rejectUnauthorized: false }` in `src/db/index.ts:18-20`

Accepts any certificate chain for the DB TLS connection. Appropriate for some
managed-Postgres dev setups, but it enables MITM against the DB connection if
carried to production. `supabase/client.ts` omits the block entirely — another
symptom of the two-client drift (§6).

### 2.11 (INFO, update 2026-09-09) — Page routes are now gated; API routes are not

The Auth foundation added root `proxy.ts`: unauthenticated page visits to
`/dashboard`, `/projects`, `/requirements`, `/backlog`, `/sprint-*`,
`/execution`, `/monitoring`, `/reports`, `/documents`, `/governance`,
`/notifications`, `/team`, `/settings`, `/calendar`, `/ai-recommendations`
redirect to `/login`, and authenticated visits to auth pages redirect to
`/dashboard`. This is UI-routing protection only — **every `/api/*` finding
above (W1, W2, W4–W6) is unchanged**: the API routes still take no session,
and repositories still query the privileged pool. Do not treat the proxy gate
as API authorization when wiring the frontend (R9).

---

## 3. Supabase integration recommendation

### 3.1 Decision: add the Supabase Auth client; keep Drizzle — with strict lane separation

Do **not** replace Drizzle with `supabase-js` wholesale, and do **not** keep
Drizzle-on-`DATABASE_URL` as the request path. Run both, each in its lane:

| Lane | Library | Credential | RLS | Use for |
|------|---------|------------|-----|---------|
| **A. Authenticated user lane** (default for all user operations) | `@supabase/ssr` + `@supabase/supabase-js` (`createServerClient`, anon key, user JWT from cookies) | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **enforced** — PostgREST honors `auth.uid()` | All normal CRUD the browser triggers through Next.js routes: projects, requirements, sprints, tasks, backlog, notifications, dashboard reads |
| **B. Privileged service lane** (exceptional, audited) | Existing Drizzle `db` on `DATABASE_URL` **or** Supabase service-role client, server-only | `DATABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_*`, never browser) | **bypassed by design** | `/api/health` DB ping, signup/org-bootstrap transactions, invitation acceptance joins, AI batch scoring, seed/migration scripts, aggregations that must cross RLS |

Rationale:

- **Supabase client is the only component that propagates the end-user identity**
  (`auth.uid()`) such that RLS policies fire. Drizzle-over-`pg.Pool` cannot do
  this without manual per-transaction `SET LOCAL` plumbing that re-implements
  what PostgREST already does — error-prone and unauditable.
- **Drizzle remains the right tool** for complex SQL, multi-table joins,
  aggregations (dashboard stats, velocity, workload), and internal jobs where
  the service role is legitimately required. `supabase-js` query builder is
  awkward for those; keep Drizzle but confine it to lane B.
- This matches the existing `AGENTS.md` rules ("Repositories use Drizzle from
  `@supabase/client`", "`SUPABASE_SERVICE_ROLE_KEY` only in server/Edge
  Function code") once `supabase/client.ts` is redefined as the authenticated
  client factory rather than a second privileged pool.

### 3.2 Required new dependencies ~~(not installed today)~~ — INSTALLED 2026-09-09

```json
{
  "@supabase/supabase-js": "^2.x",
  "@supabase/ssr": "^0.5.x"
}
```

~~(`package.json` currently has neither; `drizzle-orm`, `pg`, `next` stay.)~~
Installed for the Auth foundation: `@supabase/supabase-js@2.116.0`,
`@supabase/ssr@0.12.7` (`package.json`). `drizzle-orm`, `pg`, `next` unchanged.

### 3.3 Required new modules — PARTIALLY IMPLEMENTED 2026-09-09

```text
supabase/
  server.ts        ← createServerClient with cookie get/set, awaits cookies()
                     (Next.js 16: `await cookies()`); the ONLY place anon-key
                     browser-session client is constructed server-side
  service.ts       ← service-role client (SUPABASE_SERVICE_ROLE_KEY), server-only;
                     throws if called from client; tiny allow-list of callers
src/
  lib/supabase/…   ← thin browser client (createBrowserClient) for direct
                     Supabase reads/subscriptions IF adopted (optional; default
                     should stay "browser → Next.js API → lane A")
  utils/auth.ts    ← getAuthenticatedContext(): { userId, organizationId(s), role }
                     — resolves org membership via organization_members; single
                     choke point every route calls first
```

**Update 2026-09-09 — implemented (Auth foundation, page session only):**
`src/lib/supabase/client.ts` (browser), `src/lib/supabase/server.ts`
(server, `await cookies()`), `src/lib/supabase/proxy.ts` (`updateSession`),
plus root `proxy.ts` (protected-route gating) and
`src/app/auth/callback/route.ts` (code exchange + provisioning).
**Still pending:** `service.ts` (service-role client), `utils/auth.ts`-style
scope resolution for API routes, and any use of these clients in
`src/app/api/**` or repositories. (Original proposal text above retained.)

### 3.4 What happens to the two existing `db` objects

1. **Keep exactly one privileged Drizzle pool** (delete the duplicate).
   Recommendation: keep `supabase/client.ts` as the canonical Drizzle export
   (it matches the `AGENTS.md` `@supabase/client` import convention already used
   by `/api/health`), delete `src/db/index.ts`, and fix the six repositories'
   relative `../db` imports — *during* the refactor, not now.
2. **Rename for honesty in the meantime:** as long as it wraps `DATABASE_URL`,
   it must be named/imported as a service client (`dbService`, `serviceDb`),
   never bare `db`, so future authors cannot mistake it for a user-scoped handle.
3. **Resolve the SSL drift:** one pool = one TLS policy decision, documented.

---

## 4. Authenticated request architecture

### 4.1 Target flow (required by the brief)

```text
Browser (Supabase Auth session, httpOnly cookies via @supabase/ssr)
   ↓  Authorization: Bearer <user JWT> (cookie, never localStorage)
Next.js API Route
   ↓  1. createServerClient → auth.getUser()  [401 if invalid]
   ↓  2. resolve org context (organization_members → organization_id + role)  [403/404 if not a member]
   ↓  3. validate input (Zod in src/schemas/)  [400/422 if bad]
Lane A: authenticated Supabase client (user JWT, anon key)
   ↓  PostgREST → Postgres with auth.uid() set
RLS policies (org membership / project membership / user-self)
   ↓
organization/project rows ONLY
```

Service-lane escape hatch (audited, rare):

```text
Route → authorize (same steps 1–3, role check ADMIN/owner) → serviceDb / service-role client
   ↓  explicit justification comment + audit log write
Privileged SQL (health ping, bootstrap, cross-RLS aggregation)
```

Rules:

- **Lane A is the default.** A route reaches for the service lane only with a
  named justification (health, bootstrap, invitation-join, AI batch) and a
  same-request authorization check. "Convenience" is never a justification.
- **Never forward `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` to the browser.**
  They stay in server components, route handlers, and `supabase/functions/**`.
  Frontend keeps only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (already in `.env.example:5-6`).
- **Membership resolution happens in the route, not the repository** (§5):
  the route derives `{ userId, organizationId, role }` once, then passes a
  scope object down. Repositories never read cookies/headers themselves (keeps
  them testable and forbids ambient-authority bugs).

### 4.2 Per-route authorization checklist (applies to every future handler)

1. `getUser()` → 401 `{success:false, error:{code:"UNAUTHENTICATED",…}}` on failure.
2. Resolve organization: explicit `?organization_id=` validated against
   `organization_members`, else single-membership default, else 403 with an
   org-selection hint for multi-org users.
3. Role gate per `auth-rls-architecture.md` §5 matrix (e.g., sprint planning
   ADMIN/PM only; DEVELOPER task writes limited to `assignee_id = self`).
4. Ownership/membership check for `:id` routes (project member or org role
   permitting) → 404 (not 403) when the row exists outside the caller's scope,
   to avoid org-enumeration oracles.
5. Then query through lane A. RLS is the **second** lock, not the only one:
   belt (route checks with clear errors) + suspenders (RLS fail-closed).

### 4.3 What NOT to build

- No custom JWT/session scheme, no `localStorage` tokens, no API keys for
  browser users — Supabase Auth cookies only.
- No role logic in the browser beyond hiding affordances; every gate re-checks
  server-side.
- No direct browser → PostgREST writes until RLS policies + Storage policies
  are implemented and tested in `tests/auth/` (Database/Testing agents).
  Until then the browser talks **only** to Next.js routes.
  **[INTERIM EXCEPTION — update 2026-09-09:** auth provisioning
  (`src/lib/auth/organization.ts`, called from register page and
  `/auth/callback`) writes `users` / `organizations` / `organization_members`
  directly via the anon-key browser client. This works ONLY because RLS is
  currently disabled on all tables (W3) and is confined to the signup/bootstrap
  path with a hardcoded `ADMIN`-for-own-org role (no client-supplied roles).
  When RLS lands, this path MUST move to a signup trigger or an audited
  service-lane bootstrap (Phase 0), otherwise new signups will fail closed.
  No other browser→PostgREST writes exist.]

---

## 5. RLS interaction

Authoring policies is out of scope (Database agent, per
`auth-rls-architecture.md` §6); this section defines how the API layer
**interacts** with them.

### 5.1 Contract between API and RLS

| Principle | Meaning for this codebase |
|-----------|---------------------------|
| Routes carry identity; RLS carries the lock | Route resolves `userId/orgId/role` and scopes queries; RLS independently rejects anything that slips through |
| Fail closed | No membership row → no data. The current "return everything" default inverts to "return nothing" |
| No service-lane reads for user data | If a user-facing read needs the service key to work, the policy is wrong — fix the policy, don't bless the bypass |
| Second-hop tables derive org through joins | `requirements/sprints/tasks/backlog → projects.organization_id`; `ai_predictions → requirements → projects`. Policies (and repository joins) must walk the chain; see §6.2 |

### 5.2 How each table's policy maps to API behavior

(Based on `auth-rls-architecture.md` §6.2 + current `supabase/schema.ts`.)

| Table | Policy shape (Database agent owns) | API consequence |
|-------|------------------------------------|-----------------|
| `organizations`, `organization_members` | member-only read; ADMIN-only write | Settings/org routes pre-check membership; role promotion endpoints ADMIN-only |
| `projects` | `organization_members(user_id=auth.uid(), organization_id=projects.organization_id)` | Every project query carries caller's `organizationId`; `:id` fetch 404s across orgs |
| `requirements`, `sprints`, `tasks`, `backlog` | via parent `project_id → projects.organization_id` (+ project-membership tightener for DEVELOPER) | Repositories join `projects` to scope; DEVELOPER writes additionally constrained to own assignments |
| `ai_predictions` | via `requirement_id → requirements → projects` | Recommendation reads scoped by parent project; approve/reject gated ADMIN/PM |
| `activity_logs` | via `project_id`/`organization_id` | Dashboard/project feeds scoped; no global feed endpoint |
| `notifications` | **`user_id = auth.uid()`** (user lane, not org lane) | Route injects `userId` from session; `?user_id=` param must be rejected/ignored |
| `teams`, `team_members`, `project_members`, `invitations` | org-member read; ADMIN/PM write | Team/governance endpoints (future) follow same scope-passing pattern |
| Governance/docs tables (`risks`, `approvals`, `contracts`, `budget_line_items`, `change_requests`, `milestones`, `folders`, `documents`) | project → org chain | No endpoints until policies exist; see §8 phasing |

### 5.3 Verification hooks (for the Testing agent, not implemented here)

- Cross-org read/write attempts → 404/empty via lane A (never 403-with-body
  that confirms existence).
- Cross-project DEVELOPER read → denied; self-task write → allowed; reassign
  others → denied.
- Service-lane audit: `rg -n "serviceDb|SERVICE_ROLE|src/db" src/app/api`
  must return only allow-listed files.
- RLS-enabled assertion: every business table `isRLSEnabled: true` in Drizzle
  snapshots; anonymous key gets zero rows without a session.

---

## 6. Repository architecture

### 6.1 Current state: seven one-function pass-throughs

Each repository exports exactly one zero-argument `getAll*()` doing
`db.select().from(t)` (+ `orderBy(createdAt desc)` except backlog). There are no
`getById`, `create`, `update`, `remove`, no filters, no pagination, no scope
parameters. They are thin wrappers over the privileged pool — **the worst place
to add a bare `organization_id` string parameter ad hoc**, because every future
caller would have to remember to pass it (ambient-authority bug factory).

### 6.2 Recommendation: scope-object repositories, auth at the boundary

**Do not blindly add `organization_id`, `user_id`, `project_id` params.**
Instead:

```ts
// Illustrative shape — NOT implemented (analysis only)
type RequestScope =
  | { kind: "user"; userId: string; organizationId: string; role: "ADMIN" | "PROJECT_MANAGER" | "DEVELOPER" }
  | { kind: "service"; reason: "health" | "bootstrap" | "invitation-join" | "ai-batch" };

// Every user-facing repository function takes scope FIRST:
getProjects(scope: RequestScope, filters: { status?: ...; search?: string; page?: number; limit?: number })
getProjectById(scope: RequestScope, id: string)
getRequirements(scope, { projectId, status, ... })
getSprintBoard(scope, sprintId)
getMyTasks(scope)            // derives userId from scope — never from a param
getNotifications(scope)      // user lane: scope.userId only
```

Rules:

1. **Scope first, always.** A repository function without a scope argument
   must not exist (lint-enforceable). This makes the W2 bypass structurally
   impossible: there is no overload that "forgets" auth.
2. **Routes resolve scope; repositories consume it.** Repositories never touch
   cookies/headers/`auth.getUser()` — they receive an already-authorized scope.
   Unit tests can then inject `{kind:"user",…}` fixtures without HTTP mocks.
3. **Two implementations behind one signature family:**
   - `*.repository.ts` (lane A): builds queries on the **authenticated
     Supabase client** (or per-request Drizzle with `SET LOCAL` if the team
     standardizes that — decide once, §10 R3). Joins walk the org chain:
     `requirements→projects`, `tasks→projects`, `backlog→requirements→projects`,
     `ai_predictions→requirements→projects`.
   - `*.service.repository.ts` or `service/` (lane B): the few privileged
     operations, each file header stating its justification. The default
     import stays lane A.
4. **No `getAll*` without pagination.** Every list takes `{page, limit}` with a
   server-side cap (e.g., max 100) and returns `{items, page, limit, total}`.
5. **Validation lives in `src/schemas/` (Zod), called by routes before
   repositories.** Repositories assume validated input.
6. **Write path (future):** `create/update` functions take `(scope, input)` and
   stamp `created_by/requester` from `scope.userId`, never from the body.

### 6.3 Per-repository migration notes

| Repository | Scoping key | Notes |
|------------|-------------|-------|
| `project.repository.ts` | `projects.organization_id = scope.organizationId` | Direct org column — simplest. Add `getProjectById` with membership check; `list` gains status/search/pagination per `frontend-data-mapping.md` §7.1 |
| `requirement.repository.ts` | `requirements.project_id → projects.organization_id` + `projectId` filter required | Make `projectId` mandatory (global requirement dumps are never legitimate); add status/category/assignee/sprint filters (§7.2) |
| `sprint.repository.ts` | `sprints.project_id → projects.organization_id` | Board/planning queries keyed by `projectId`/`sprintId`; capacity math stays in service layer |
| `task.repository.ts` | `tasks.project_id → projects.organization_id` | Split `getMyTasks(scope)` (`assignee_id = scope.userId`) from `getTeamTasks(scope, {projectId,…})`; DEVELOPER second lane denied at route |
| `backlog.repository.ts` | `backlog.project_id → projects.organization_id`, ordered by `rank` | Keep rank ordering; `reorder` must be a privileged transaction (service lane, PM+ only) |
| `ai-recommendation.repository.ts` | `ai_predictions.requirement_id → requirements.project_id → org` | Reads join requirement+sprint for display; approve/reject are separate mutations gated ADMIN/PM |
| `notification.repository.ts` | `notifications.user_id = scope.userId` | **User lane, not org lane.** No org param; `markRead(scope, id)` must verify ownership before update |

---

## 7. Dashboard API contract

### 7.1 Audit: exact data the dashboard UI needs

From `src/app/dashboard/page.tsx` (all currently mock):

| UI block (file lines) | Mock var | Data needed | Source tables / derivation |
|-----------------------|----------|-------------|----------------------------|
| KPI cards (`158-184`) | `stats[0]` "Active Projects" + trend "+2" | `COUNT(projects WHERE status='active' AND org=caller)` + delta (new this week) | `projects` |
| KPI cards | `stats[1]` "Team Members" + "+5" | `COUNT(active members in caller org)` | `organization_members` ⨝ `users` |
| KPI cards | `stats[2]` "Upcoming Deadlines" + "3 this week" | `COUNT(sprints ending ≤7d in org)` + soonest 3 | `sprints` ⨝ `projects` |
| KPI cards | `stats[3]` "Need Attention" + "2 high priority" | blocked/at-risk items: `tasks WHERE column_status IN (review, testing)` + `requirements WHERE status IN (pending, blocked)` + high-priority subset | `tasks`, `requirements` |
| Recent Projects cards (`189-228`) | `recentProjects` (4): name, client, status, progress, `lastUpdated` relative | latest 4 org projects, `updated_at` formatted relative | `projects` |
| Recent Activity feed (`231-260`) | `recentActivity` (4): action, project, user, time | latest N `activity_logs` in org with joins | `activity_logs` ⨝ `projects` ⨝ `users` |
| Active Projects table (`263-333`) | `projects` (5): name, client, **manager name**, status, progress, **current sprint name**, endDate | org projects + `manager_id → users` name + active-sprint name per project | `projects` ⨝ `users` ⨝ `sprints` |

All six are **org-scoped aggregates/joins** — the strongest argument for a
dedicated `GET /api/dashboard` (one round-trip, one auth check, one scope)
rather than 4–6 separate fan-out calls from the browser.

### 7.2 Proposed `GET /api/dashboard` response contract — DO NOT IMPLEMENT YET

```text
GET /api/dashboard   (auth required; org resolved per §4.2)
```

```jsonc
{
  "success": true,
  "data": {
    "organization": { "id": "uuid", "name": "Acme", "slug": "acme" },
    "stats": {
      "activeProjects":      { "value": 12, "trend": "+2" },
      "teamMembers":         { "value": 48, "trend": "+5" },
      "upcomingDeadlines":   { "value": 7,  "trend": "3 this week" },
      "needsAttention":      { "value": 3,  "trend": "2 high priority" }
    },
    "recentProjects": [
      {
        "id": "uuid", "name": "E-Commerce Platform Redesign",
        "client": "RetailCorp Inc.", "status": "active",
        "progress": 65, "updatedAt": "2026-09-09T10:00:00Z",
        "manager": { "id": "uuid", "name": "John Smith" },
        "currentSprint": { "id": "uuid", "name": "Sprint 4" }
      }
    ],
    "activeProjects": [
      {
        "id": "uuid", "name": "…", "client": "…",
        "manager": { "id": "uuid", "name": "…" },
        "status": "active", "progress": 65,
        "currentSprint": { "id": "uuid", "name": "Sprint 4" },
        "endDate": "2026-09-15"
      }
    ],
    "upcomingDeadlines": [
      {
        "kind": "sprint", "id": "uuid", "title": "Sprint 4",
        "project": { "id": "uuid", "name": "…" },
        "dueDate": "2026-09-15", "daysRemaining": 6
      }
    ],
    "attentionItems": [
      {
        "kind": "task" | "requirement", "id": "uuid",
        "displayId": "TASK-101", "title": "…",
        "priority": "high", "status": "review",
        "project": { "id": "uuid", "name": "…" },
        "assignee": { "id": "uuid", "name": "…" }
      }
    ],
    "recentActivity": [
      {
        "id": "uuid", "action": "approved",
        "entityType": "requirement", "entityId": "uuid",
        "project": { "id": "uuid", "name": "…" },
        "actor": { "id": "uuid", "name": "John Smith" },
        "createdAt": "2026-09-09T09:50:00Z"
      }
    ]
  }
}
```

Notes:

- Timestamps are ISO-8601 UTC; relative labels ("2 hours ago") are a
  presentation concern (existing `formatRelativeTime` on the client).
- `trend` strings preserve the current mock's shape; a later iteration may
  promote them to `{delta, window}` objects — additive change only.
- Pagination: `recentProjects`/`recentActivity` fixed small N (4–5);
  `activeProjects` paginated (`?page=&limit=`) once the table outgrows the
  dashboard; deadline/attention lists capped (e.g., 10) with `total` counts.
- Error cases follow §7.3 (401 when unauthenticated, 403 when the caller has
  no org membership, never a cross-org payload).

### 7.3 API response contract (all endpoints, keep the existing envelope)

**Keep `{success, data}`** — six of seven live routes already use it and the
frontend will be built against it. Standardize the error half, which is
currently ad hoc:

| Case | HTTP | Body |
|------|------|------|
| Success | 200 (201 for creates) | `{ "success": true, "data": <payload> }` — lists as `{ "items": [], "page": 1, "limit": 20, "total": 0 }` |
| Validation error | 400 (or 422 — pick one, use everywhere) | `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [{ "field": "status", "message": "…" }] } }` |
| Authentication error | 401 | `{ "success": false, "error": { "code": "UNAUTHENTICATED", "message": "Authentication required" } }` |
| Authorization error | 403 (or 404 to avoid org oracle — §4.2.4) | `{ "success": false, "error": { "code": "FORBIDDEN", "message": "Insufficient permissions" } }` |
| Not found (own scope) | 404 | `{ "success": false, "error": { "code": "NOT_FOUND", "message": "Resource not found" } }` |
| Server error | 500 | `{ "success": false, "error": { "code": "INTERNAL_ERROR", "message": "Something went wrong" } }` — log details server-side only, never echo DB errors |

Additional rules:

- **Do not build a global framework/middleware harness yet.** A ~20-line
  `apiResponse.ts` helper (`ok()`, `fail()`) plus the per-route auth checklist
  (§4.2) is sufficient at this API count. Revisit when routes exceed ~15.
- Fix `/api/health` to match: either adopt the same envelope or document it as
  the intentional exception (uptime probes prefer tiny bodies). If kept
  exceptional, note it in `docs/api/rest-api.md`.
- `POST/PATCH/PUT` validation errors come from Zod in `src/schemas/`; the
  `details[]` shape above maps 1:1 to Zod issues.

---

## 8. Required API list

### 8.1 Frontend-need analysis (from `frontend-data-mapping.md` §3/§7 + page audit)

The frontend spans ~20 pages, but only a subset has schema backing today
(`supabase/schema.ts` now covers organizations, governance, documents,
milestones, preferences after migration `0001`; still missing: calendar events,
sprint velocity/carry-forward columns, task progress — see
`frontend-data-mapping.md` §12 as partially superseded by `0001`).

**Actually required by the frontend (build these):**

| # | Endpoint | UI consumer | Priority |
|---|----------|-------------|----------|
| 1 | `GET /api/dashboard` | Dashboard KPIs, recent projects/activity, deadlines, attention (§7.2) | P0 — first aggregate |
| 2 | `GET /api/projects?status=&search=&sort=&page=&limit=` | Projects list + filter tabs + counts | P0 |
| 3 | `GET /api/projects/:id` (detail + stats + activity + deadlines) | Project detail command center | P0 |
| 4 | `GET /api/requirements?project_id=&status=&category=&priority=&assignee_id=&sprint_id=&search=&page=&limit=` | Requirements table + validation queue | P0 |
| 5 | `GET /api/sprints?project_id=` + `GET /api/sprints/:id/board` (columns + counts) | Sprint planning, sprint board, monitoring | P0 |
| 6 | `GET /api/tasks?project_id=&sprint_id=&status=&assignee_id=&priority=` + `GET /api/tasks/my-work` | Sprint board list view, execution workspace | P0 |
| 7 | `GET /api/backlog?project_id=` (+ `PATCH /api/backlog/reorder` later) | Backlog page | P1 |
| 8 | `GET /api/notifications?type=&read=&page=&limit=` + `PATCH /api/notifications/:id/read` + `PATCH /api/notifications/read-all` | Notifications center + nav badge | P1 |
| 9 | `GET /api/ai-recommendations?project_id=&status=` (+ approve/reject mutations later) | AI recommendations page | P1 |
| 10 | `GET /api/teams` + `GET /api/users?search=&role=&status=` + `GET /api/invitations` | Team management | P1 |
| 11 | `GET /api/activity?project_id=&page=&limit=` | Dashboard / project / execution / monitoring feeds | P1 (may fold into dashboard + project detail initially) |

**Defer (no endpoint merely because a table exists):**

- Governance (`budget_line_items`, `contracts`, `approvals`, `risks`,
  `change_requests`): UI exists (`/governance`) but product must confirm the
  write matrix first (`auth-rls-architecture.md` §12.6 defers DEVELOPER
  risk/change-request creation). Read endpoints follow the same scope pattern
  when approved — no design work needed now.
- Documents/folders: needs Storage buckets + metadata RLS sync first
  (`auth-rls-architecture.md` §9); then `GET /api/documents?folder_id=&search=`
  + signed-URL upload flow.
- Reports/monitoring/calendar: compositional or derived (velocity,
  carry-forward, health scores, calendar events table all still open) — serve
  via project/sprint/task primitives until the schema questions close.
- `GET /api/roles`: static enum + hardcoded permission matrix — frontend
  constant, not an endpoint.
- `POST/PUT/PATCH/DELETE` mutations generally: design the read path + auth
  + RLS first; mutations follow per-resource with the §4.2 checklist.

### 8.2 Disposition of the current eight routes

| Current route | Verdict | Action |
|---------------|---------|--------|
| `/api/projects` | **incomplete** (works, leaks) | Keep path; add auth + org scope + filters/pagination → §8.1 #2 |
| `/api/requirements` | **incomplete** | Keep path; require `project_id`, add scope + filters → #4 |
| `/api/sprints` | **incomplete** | Keep path; scope via project chain → #5 |
| `/api/tasks` | **incomplete** | Keep path; scope + split my-work/team-work → #6 |
| `/api/backlog` | **incomplete** | Keep path; require `project_id`, order by rank → #7 |
| `/api/ai-recommendations` | **incomplete** | Keep path; join requirement/sprint, add status filter → #9 |
| `/api/notifications` | **broken stub** (0-byte file) | Rebuild user-scoped per §6.3 → #8 |
| `/api/health` | **safe** (no user data) | Keep as the lone service-lane GET; align envelope or document exception |

No current route is "safe" for user data; none is "insecure" in the active-breach
sense today only because nothing calls them yet and RLS is uniformly off.
All are **dependent on future Auth + RLS** except `/api/health`.

---

## 9. CRUD plan

Phased so every step keeps the system coherent (no endpoint lands without its
auth + scope + policy):

**Phase 0 — Auth & policy foundation (prerequisite, other agents).**
Supabase Auth wiring **[PARTIALLY DONE 2026-09-09:** email/password + Google
OAuth, session proxy, provisioning; signup trigger / service-lane bootstrap
migration still pending — see §4.3 interim exception**], signup trigger,
`organization_members` bootstrap, RLS policies per
`auth-rls-architecture.md` §6/§11, `tests/auth/` vectors. The API work below
assumes this lands first — building scoped routes against
unenforced policies repeats W2.

**Phase 1 — Reads for the core loop (P0).**
`GET /api/projects`, `GET /api/projects/:id`, `GET /api/requirements`,
`GET /api/sprints(/:id/board)`, `GET /api/tasks(/my-work)`,
`GET /api/dashboard` — lane A, scope-first repositories (§6.2), paginated
envelopes (§7.3), Zod query schemas.

**Phase 2 — Reads for the second loop (P1).**
Backlog (+ reorder as first scoped mutation), notifications (+ read/read-all),
AI recommendations reads, teams/users/invitations reads, activity feeds.

**Phase 3 — Mutations, resource by resource.**
Per resource: `POST` (create, ADMIN/PM; stamp `scope.userId`), `PATCH :id`
(field-level gates — e.g., DEVELOPER may move own tasks, never reassign),
`DELETE :id` (ADMIN-or-owner). Each mutation writes an `activity_logs` row in
the same transaction (service-layer concern; `src/services/` is currently
empty and should own this).

**Phase 4 — Governance & documents.**
Gated on product confirmation of the write matrix + Storage RLS. Same patterns;
no new architecture.

**Explicit non-goals:** global (cross-org) list endpoints, client-supplied
`user_id`/`organization_id` writes, direct browser PostgREST writes before
policies + tests exist.

---

## 10. Recommended implementation order

1. **Decide the lane split (this review, §3).** One-line ADR: lane A
   (`@supabase/ssr` user client) default; lane B (single Drizzle service pool)
   allow-listed. Unblocks everything below.
2. **Install `@supabase/supabase-js` + `@supabase/ssr`; add `supabase/server.ts`,
   `supabase/service.ts`, `src/utils/auth.ts`** (scope resolution). No route
   changes yet. **[PARTIALLY DONE 2026-09-09:** packages installed; browser /
   server / proxy clients live at `src/lib/supabase/*` with the `proxy.ts`
   route gate. `service.ts` and API scope resolution still pending.]**
3. **Collapse to one privileged pool (R3).** Delete `src/db/index.ts` OR
   `supabase/client.ts`'s pool; rename survivor `serviceDb`; fix imports.
   Eliminates the silent-bypass fork.
4. **Add `apiResponse.ts` helper + Zod query schemas** for the P0 reads (§7.3).
   Small, reviewable, no behavior change to live routes.
5. **Rebuild P0 reads one by one** (projects → project detail → requirements →
   sprints/board → tasks → dashboard), each with scope-first repository,
   pagination, and `tests/api/` integration coverage. Notifications stub is
   rebuilt in Phase 2, not here.
6. **Database agent: RLS policies** per `auth-rls-architecture.md` §6,
   verified by `tests/auth/` cross-org/cross-project/self-task vectors (§5.3).
7. **Wire the dashboard UI to `GET /api/dashboard`** (first and only frontend
   connection), then proceed down the §8.1 list.
8. **Mutations (Phase 3)** only after 5–7 are green for the resource in question.
9. **Service-lane audit + LK (low-key) hardening:** `rejectUnauthorized`
   decision, `NEXT_PUBLIC_*` secret scan, Realtime filter scoping.

---

## 11. Migration/refactoring risks

| # | Risk | Likelihood / Impact | Mitigation |
|---|------|---------------------|------------|
| R1 | **Silent RLS bypass persists** — authors keep importing the privileged `db` out of habit after policies land | High / Critical | R3 single-pool rename (`serviceDb`); scope-first repository signatures (§6.2) that don't compile without a scope; `rg` allow-list audit in CI |
| R2 | **Two-pool drift** (`ssl` mismatch, divergent configs) causes prod-only connection failures | Medium / High | Collapse to one pool now (order step 3); one TLS decision, documented |
| R3 | **Which-pool-to-delete breaks imports** — six repos import `../db`, health imports `@supabase/client` | Certain / Low | Mechanical codemod during refactor; `AGENTS.md` already blesses `@supabase/client` as canonical — keep that file, repoint imports |
| R4 | **Second-hop scoping bugs** — requirements/sprints/tasks/backlog/AI leak via missed join to `projects.organization_id` | Medium / Critical | Repository-level join helpers + integration tests seeding two orgs; RLS as backstop |
| R5 | **Notifications user-lane confusion** — applying the org pattern leaks all users' rows | Medium / High | Separate user-lane code path (§6.3); forbid `organizationId` param on notification functions |
| R6 | **Org-enumeration oracles** — 403-vs-404 inconsistency reveals row existence across orgs | Medium / Medium | §4.2.4: cross-scope `:id` fetches return 404; document the convention |
| R7 | **N+1 / fan-out on dashboard + detail aggregates** (manager names, sprint names, counts per project) | High / Medium | Single `GET /api/dashboard` + `GET /api/projects/:id` with batched joins (Drizzle) or one lane-B aggregation after auth; add `EXPLAIN` review for the board/activity queries |
| R8 | **Envelope drift** — new authors copy `/api/health`'s `{ok}` shape | Low / Low | `apiResponse.ts` helper; note health's exception in `docs/api/rest-api.md` |
| R9 | **Frontend connects before auth lands** — mock replacement wires directly to current dumps | Medium / Critical | Gate UI wiring (order step 7) on steps 5–6 per resource; keep mocks until the resource's auth+RLS+tests are green |
| R10 | **Supabase SSR cookie pitfalls** (Next.js 16 `await cookies()`, middleware refresh, server/client boundary) | Medium / Medium | Follow `@supabase/ssr` Next.js guide exactly; centralize in `supabase/server.ts`; add an auth-smoke test (`401` unauthenticated, `200` authenticated) per route |
| R11 | **Scope creep into mutations/governance/documents** before reads stabilize | Medium / Medium | Enforce §8 phasing in review; governance/documents need product + Storage prerequisites first |

---

## Appendix A — Per-API audit table (evidence)

| Route | Repository (`src/repositories/`) | Query | Response | Authorization | Org filter | User filter | Issue → verdict |
|-------|----------------------------------|-------|----------|---------------|------------|-------------|-----------------|
| `GET /api/projects` (`api/projects/route.ts:4`) | `project.repository.ts:5` `getAllProjects()` | `SELECT * FROM projects ORDER BY created_at DESC` — no WHERE/LIMIT | `{success, data: projects[]}` 200 / generic 500 | none | none | none | full cross-org dump → **incomplete, dependent on Auth+RLS** |
| `GET /api/requirements` (`api/requirements/route.ts:4`) | `requirement.repository.ts:5` | `SELECT * FROM requirements ORDER BY created_at DESC` | `{success, data}` 200 / 500 | none | none (2nd-hop org via `project_id` ignored) | none | same → **incomplete** |
| `GET /api/sprints` (`api/sprints/route.ts:4`) | `sprint.repository.ts:5` | `SELECT * FROM sprints ORDER BY created_at DESC` | `{success, data}` 200 / 500 | none | none (via `project_id` ignored) | none | same → **incomplete** |
| `GET /api/tasks` (`api/tasks/route.ts:4`) | `task.repository.ts:5` | `SELECT * FROM tasks ORDER BY created_at DESC` | `{success, data}` 200 / 500 | none | none (via `project_id` ignored) | none (no `assignee_id=self`) | same, + self-task rule missing → **incomplete** |
| `GET /api/backlog` (`api/backlog/route.ts:4`) | `backlog.repository.ts:4` | `SELECT * FROM backlog` — no ORDER BY | `{success, data}` 200 / 500 | none | none (via `project_id` ignored) | none | same, + rank ordering missing → **incomplete** |
| `GET /api/ai-recommendations` (`api/ai-recommendations/route.ts:4`) | `ai-recommendation.repository.ts:5` | `SELECT * FROM ai_predictions ORDER BY created_at DESC` | `{success, data}` 200 / 500 | none | none (3rd-hop org ignored) | none | same → **incomplete** |
| `GET /api/notifications` (`api/notifications/route.ts` — 0 bytes) | `notification.repository.ts:5` (unwired) | (would be `SELECT * FROM notifications`) | none (stub) | n/a | n/a (user-lane table) | none | fails closed today; naive wiring = all-users leak → **broken stub, rebuild user-scoped** |
| `GET /api/health` (`api/health/route.ts:6`) | inline `db.execute(select 1)` | `select 1` | `{ok}` 200 / 500 (envelope differs) | none needed | n/a | n/a | no user data; keep as service-lane ping → **safe** |

## Appendix B — Primary question: answered

> *How should authenticated Supabase users interact with the existing
> API/repository layer while preserving RLS and organization isolation?*

**Browser → (Supabase Auth cookie session) → Next.js API route (verifies user,
resolves `organization_members` scope, validates input) → authenticated
Supabase client carrying the user JWT (lane A) → PostgREST → RLS
(org-membership / project-membership / user-self) → scoped rows.** Drizzle on
the privileged connection is retained strictly for the audited service lane
(health, bootstrap, invitation-join, AI batch, cross-RLS aggregation) and must
never serve normal user reads/writes — otherwise it silently bypasses the very
RLS the system depends on. Repositories take an explicit scope object as their
first argument so the bypass becomes unrepresentable; see §4–§6.
