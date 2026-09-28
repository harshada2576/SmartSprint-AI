# SmartSprint AI

AI-assisted sprint planning and project governance on Next.js 16 + Supabase
(PostgreSQL + Auth + RLS + Storage) + Drizzle ORM.

## Six-role RBAC (authoritative)

| Role | Scope |
| --- | --- |
| `ADMIN` | Organization-wide. Approves/rejects role-change requests and any approval type. Views audit log. |
| `PROJECT_MANAGER` | Organization-wide. Plans work, decides `scope`/`resource` approvals, approves AI output. |
| `DEVELOPER` | Project-scoped via `project_members`. Edits own assigned tasks (status/progress/blocked/reason), comments, views AI output. |
| `FINANCE` | Project-scoped via `project_members`. Budget/contracts read+edit, decides `budget` approvals, resolves `budget`/`resource` risks. |
| `LEGAL` | Project-scoped via `project_members`. Budget/contracts read-only (contracts read), decides `vendor` approvals, resolves `legal` risks. |
| `HR` | Organization-scoped, zero project-data access. Invites/removes members, initiates role changes for others, edits `department`/`jobTitle`, manages documents. |

Role changes flow **only** through `role_change_requests`
(`POST /api/role-requests` → `PATCH /api/role-requests/[id]` by a different
ADMIN). Direct `organization_members.role` writes are rejected by trigger
for every database role. RLS is the ultimate security boundary; API guards
are defense-in-depth.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in values below
```

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection (Supabase pooler URL; percent-encode `@` as `%40`). Used by Drizzle and `psql` migrations. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key (browser-safe). |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (server) | Server-only trusted lane (provisioning, system notifications, signed URLs). Never add a `NEXT_PUBLIC_` prefix, never import in browser code. |
| `AI_API_KEY` / `OPENAI_API_KEY` | for live LLM | Without a key the assistant/breakdown use the deterministic fallback engine. |
| `AI_MODEL` | no | Defaults to `gpt-4o-mini`. |

Supabase Dashboard > Authentication > URL Configuration: Site URL = app
origin; Redirect URLs must include `<site-url>/auth/callback`.

### Database migrations

`supabase/schema.ts` is the source of truth. Migrations are plain SQL applied
in order (Supabase CLI or `psql` — do **not** rely on `drizzle-kit push`
for security deployment):

```bash
# Supabase CLI
supabase db push
# or plain psql
psql "$DATABASE_URL" -f supabase/migrations/0000_initial_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/0001_add_organizations_and_governance.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_rls_security_foundation.sql
psql "$DATABASE_URL" -f supabase/migrations/0003_mvp_task_comments_risks_sprints.sql
psql "$DATABASE_URL" -f supabase/migrations/0004_rbac_expansion.sql
psql "$DATABASE_URL" -f supabase/migrations/0005_rbac_rls_rewrite.sql
psql "$DATABASE_URL" -f supabase/migrations/0006_hr_member_removal.sql
```

> `ALTER TYPE user_role ADD VALUE` cannot run inside a transaction block on
> some Postgres versions. If a deploy wraps files in a transaction, run the
> three `ADD VALUE` statements of `0004` separately first.

Key migration contents:

- `0004_rbac_expansion` — `FINANCE`/`LEGAL`/`HR` roles, `risk_domain` on
  `risks`, `role_change_requests` (+ pending-per-user guard),
  `task_dependencies`, `task_attachments`, AI-insight dedup columns
  (`issue_type`, `entity_id`, `risk_domain`, `dedup_key`), Storage buckets
  (`project-documents`, `task-attachments`). HR employee-domain tables
  (`employees`, `leave_requests`, …) are intentionally deferred.
- `0005_rbac_rls_rewrite` — typed approval routing, risk-domain policies,
  role-request RLS, direct-role-write trigger, document matrix
  (ADMIN/FINANCE/LEGAL/HR), ADMIN-only audit, task blocked-guard +
  non-staff field boundary, budget-editor (ADMIN/PM/FINANCE) policies,
  Storage object authorization mirroring metadata.
- `0006_hr_member_removal` — HR member removal (no self-removal).

### Local development

```bash
npm run dev        # Next.js dev server
npm run typecheck  # TypeScript check
npm run lint       # ESLint
```

### Deployment

See [docs/deployment/](docs/deployment/) for environments, Supabase setup,
Storage configuration, and operations. Production checklist:

1. Set all required env vars (service-role key server-only).
2. Apply migrations `0000`–`0006` in order.
3. Create Storage buckets `project-documents`, `task-attachments` (private;
   created by `0004`, policies by `0005`).
4. `npm run build && npm start`.

### Authentication

Supabase Auth (session cookies + `Authorization: Bearer` fallback for API
clients). Identity is derived server-side from `auth.getUser()`; roles come
from `organization_members`, never from request claims. Page routes are
guarded by `proxy.ts`; every API route authenticates independently.

### AI configuration

- `/api/ai/breakdown` (generate: ADMIN/PM/DEV) → `/api/ai/breakdown/approve`
  (ADMIN/PM in the target org only).
- `/api/ai/assistant` enforces scope **before** building LLM context (HR:
  directory only; FINANCE/LEGAL/DEV: member projects).
- `/api/ai-recommendations` (view: all but HR) + `PATCH …/[id]`
  (decide: ADMIN/PM).
- Risk detection runs synchronously on monitoring evaluation
  (`GET /api/risks?projectId=…`, `GET /api/monitoring/[projectId]`);
  insights deduplicate on `project_id + issue_type + entity_id`; no
  background scheduler in MVP.

### Storage configuration

Private buckets `project-documents` and `task-attachments`. Object access
mirrors metadata authorization (`smartsprint_can_read_storage_object`):
denied metadata ⇒ denied object (no signed-URL bypass). Downloads go
through `POST /api/documents/[id]` (`{"action":"signed-url"}`) and
`POST /api/tasks/[id]/attachments` (same action), which check metadata
access first and mint 5-minute URLs via the service-role client.

### Test execution

```bash
npm test              # full suite (vitest)
npm run test:security # tests/auth + tests/database (RLS contracts)
```

Static RLS/policy contracts always run. Live behavioral tests need
`DATABASE_URL` (+ Supabase REST env) with migrations applied and seed
loaded; without them the live cases skip and report
`LIVE RLS BEHAVIORAL TESTS NOT EXECUTED`. New suites:

- `tests/rbac/role-model.test.ts` — approval routing, risk domains,
  role-request shapes/decisions, AI gates, dedup keys, task boundary.
- `tests/database/rbac-migration.test.ts` — static pins for `0004`/`0005`/
  `0006` policies, triggers, and schema parity.

### Key API surfaces

| Area | Routes |
| --- | --- |
| Roles | `POST/GET /api/role-requests`, `PATCH /api/role-requests/[id]` |
| Members | `GET/PATCH/DELETE /api/organization/members` (ADMIN + HR) |
| Governance | `/api/governance?resource=budget\|contracts\|approvals\|changes\|milestones`, `/api/governance/[id]` |
| Documents | `/api/documents`, `/api/documents/[id]` (metadata + signed URLs) |
| Tasks | `/api/tasks/[id]/dependencies`, `/api/tasks/[id]/attachments` |
| Audit | `GET /api/admin/audit` (ADMIN; filters: organization, action, date) |
| Settings | `GET/PATCH /api/settings` (own `user_preferences`) |
| AI | `/api/ai/breakdown`, `/api/ai/breakdown/approve`, `/api/ai/assistant`, `/api/ai-recommendations` (+ `PATCH …/[id]`) |

Calendar is deferred (permission matrix documented, no backend/UI build).
`admin/organizations` platform-operator management is deferred.
