# Secure Signup Provisioning — Trusted Server Lane

Status: implemented (server lane) · RLS preserved · no migration applied by this agent.

## 1. Authority model

`auth.users → public.users → organizations → organization_members`

Roles: exactly `ADMIN`, `PROJECT_MANAGER`, `DEVELOPER`. The organization
creator is always `ADMIN`. Users never choose their role from the browser.

## 2. Final architecture

```
Browser (anon key only)
  │  auth.signUp / signInWithOAuth / signInWithPassword
  ▼
Supabase Auth (auth.users)
  │  session (cookie) or email-confirmation / OAuth `code`
  ▼
Trusted server lane (service-role key, server-only)
  │  GET  /auth/callback  — code exchange + provision + safe redirect
  │  POST /auth/provision — cookie/bearer verification + provision (JSON)
  │  both → ensureUserProvisionedServerOnly() in
  │          src/lib/auth/provision-server.ts
  ▼
public.users (id = auth uid) → organizations (one) → organization_members (one ADMIN)
```

Why: RLS intentionally denies organization bootstrap for normal callers —
no `INSERT` policy on `organizations`, and `organization_members` inserts
require an existing `ADMIN`. The trusted lane bypasses RLS with
`SUPABASE_SERVICE_ROLE_KEY` precisely because it re-validates identity and
hardcodes `ADMIN`. RLS policies are unchanged.

File roles:

- `src/lib/auth/organization.ts` — **client-safe only**: pure name/slug
  derivation plus `requestProvisioning()` (a `fetch` wrapper for
  `POST /auth/provision`). No DB writes, no service-role import.
- `src/lib/auth/provision-server.ts` — **server-only**: service-role client
  factory + `ensureUserProvisionedServerOnly()`. Throws in browsers via a
  `typeof window` guard. Never imported by client components.
- `src/app/auth/provision/route.ts` — verifies identity from the cookie
  session (`@/lib/supabase/server` `auth.getUser()`), falling back to a
  verified `Authorization: Bearer` token for the signup race window. Accepts
  only display fields (`firstName`, `lastName`, `organizationName`); any
  role/id/membership fields are ignored. Returns safe `{ ok, code }` JSON.
- `src/app/auth/callback/route.ts` — exchanges `code`, calls
  `auth.getUser()`, skips provisioning for `next=/reset-password*`, then
  calls the same server-only function. Safe internal redirects only.
- `src/app/register/page.tsx` — calls `auth.signUp()` with metadata, then
  `requestProvisioning()` when a session exists; otherwise shows the
  verify-email state and lets `/auth/callback` provision later.

## 3. Flows

### Registration (email confirmation OFF)

1. Browser `auth.signUp({ email, password, data: { first_name, last_name,
   organization_name } })`.
2. Session returned → browser `POST /auth/provision` with display fields +
   `Authorization: Bearer <access_token>` (cookies also sent).
3. Server verifies identity, upserts `public.users`, creates one org + one
   `ADMIN` membership when the user has none.
4. Browser routes to `/dashboard`.

### Registration (email confirmation ON)

1. `signUp` returns no session → UI shows verify-email state.
2. User clicks link → `GET /auth/callback?code=…`.
3. Server exchanges code, verifies `getUser()`, provisions as above.
4. Redirect to safe `next` (`/dashboard` default).

### Google OAuth

1. `signInWithOAuth({ provider: "google" })` → Google → `/auth/callback?code=…`.
2. Exchange + `getUser()` + server provisioning. Display names/org fall back
   to Google metadata (`given_name`/`family_name`/`full_name`) or
   `"<First>'s Workspace"`.
3. Repeat sign-ins hit the idempotency gate (existing membership → no new
   org).

### Password reset / recovery

- `forgot-password` sends a link to `/auth/callback?next=/reset-password`.
- Callback detects `next.startsWith("/reset-password")` and redirects there
  **without provisioning**. `reset-password` only calls `auth.updateUser()`.
- `POST /auth/provision` is never called by the recovery UI. Even if called
  manually, it is a no-op for already-provisioned users (membership gate).

### Existing-account login

- `login` uses `signInWithPassword` only and never provisions. Users
  provisioned via signup/callback keep their org; no duplicate org is
  created on re-login.

## 4. Idempotency

`ensureUserProvisionedServerOnly()` checks `organization_members` for the
verified `user_id` before creating anything:

- Membership exists → return `{ organizationId, createdOrganization: false }`.
- Otherwise create org (collision-safe slug) + one `ADMIN` row; on
  membership-write failure, best-effort delete the orphan org so a retry is
  clean.

Safe under: callback refresh/retry, double-POST, network retry, OAuth retry.
Limitation: two **concurrent** first-time POSTs could both pass the
membership check before either inserts (no DB-level idempotency key links an
auth identity to a single bootstrap org). The window is tiny and retries
converge; see §7 for the optional Database-agent hardening.

Seeded users: if `public.users.email` already maps to a **different** id,
provisioning throws `account_exists` and never merges or re-owns rows. Fresh
registrations are independent of seed UUIDs.

## 5. Service-role usage

- Exists only in `src/lib/auth/provision-server.ts` (`getServiceRoleClient`)
  via `process.env.SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_`).
- Never imported by client code, never returned to the browser, never
  logged. Server route errors map to safe codes (`account_exists`,
  `oauth_no_email`, `organization_name_required`, `session_expired`,
  `provisioning_failed`) with no SQL/internals.
- Static audit: `SUPABASE_SERVICE_ROLE_KEY` appears only in
  `provision-server.ts`, `.env.example` (placeholder), and docs. No
  `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE*` variable exists.

## 6. How ADMIN assignment is protected

- No role parameter exists on any client-reachable function. `requestProvisioning`
  sends only display names; the provision route strips everything else.
- `ORG_CREATOR_ROLE = "ADMIN"` is a server-only constant used for the single
  first-membership insert. Existing memberships are never updated, so login
  or retry can never promote/demote.
- RLS still forbids browser-side role writes (`organization_members` updates
  require org `ADMIN`; role lives only there, not on `users`).

## 7. Database-agent handoff (no migration applied here)

Optional hardening the Database/RLS agent may implement separately (this
agent did not touch `supabase/migrations/**`):

1. **Deterministic `public.users` bootstrap trigger** (optional, recommended):
   `auth.users INSERT → public.users (id=NEW.id, email=NEW.email,
   names from metadata, status='active')` with `SECURITY DEFINER`,
   pinned `search_path`, fail-closed on email conflict. The server lane
   already upserts idempotently, so the trigger must also be idempotent
   (`ON CONFLICT (id) DO NOTHING`, never overwrite). If added, keep the
   server lane for org + ADMIN creation (RLS still denies those to callers).
2. **Concurrent-bootstrap guard** (optional): e.g. a partial unique index or
   advisory-lock-friendly bootstrap marker keyed by `user_id` so concurrent
   first-time provisions cannot mint two orgs. Current behavior is safe under
   sequential retry; this closes the concurrent race.
3. Do NOT weaken RLS bootstrap denials to "fix" provisioning — the trusted
   lane exists because those denials are correct.

## 8. Validation performed

- `npm run typecheck` — must pass (run in CI/dev).
- `npx eslint src/lib/auth/organization.ts src/lib/auth/provision-server.ts
  src/app/auth/provision/route.ts src/app/auth/callback/route.ts
  src/app/register/page.tsx` — must pass.
- `npm run build` — run when possible.
- Dependency-graph audit: no `"use client"` module imports
  `provision-server` or `SUPABASE_SERVICE_ROLE_KEY`; `grep` for
  `ensureUserProvisioned` shows only the server-only definition + its two
  server call sites; `organization.ts` no longer exports privileged writes.

## 9. Remaining live-test requirements (needs Supabase env)

Static validation cannot replace live Auth. With a preview project:

1. Fresh email signup (confirmation OFF) → session → `POST /auth/provision`
   → one `users` row (`id = auth uid`), one org, one `ADMIN` membership.
2. Repeat `POST /auth/provision` + refresh `/auth/callback?code=<reused>`
   → same org, `createdOrganization: false`, no duplicates.
3. Existing user login → no new org.
4. Google OAuth first login → provisioned once; second login → no new org.
5. Email-confirmation ON signup → no rows before click; callback provisions.
6. Recovery link → lands on `/reset-password`, no org created.
7. Seeded-email collision → `account_exists`, no merge, signed out.
8. `?next=https://evil.example` → falls back to `/dashboard`.
