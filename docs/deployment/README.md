# Deployment

## Environments

| Environment | App | Database |
| --- | --- | --- |
| Local | `npm run dev` (http://localhost:3000) | Supabase-hosted Postgres via `DATABASE_URL` (pooler URL) |
| Preview | Vercel/Node preview deployment | Supabase preview branch (or staging project) |
| Production | `npm run build && npm start` | Supabase production project |

Promote code preview → production only after `npm run typecheck`,
`npm run lint`, and `npm test` pass, and migrations `0000`–`0006` apply
cleanly to a staging database first.

## Supabase setup

1. Create the project; note the project URL and anon key.
2. Dashboard > Authentication > URL Configuration:
   - Site URL = app origin (e.g. `http://localhost:3000`, production origin).
   - Redirect URLs must include `<site-url>/auth/callback`.
   - Google OAuth additionally needs the Supabase callback URL in Google
     Cloud Console (Providers > Google).
3. Generate/rotate the service-role key; store as `SUPABASE_SERVICE_ROLE_KEY`
   (server-only — never `NEXT_PUBLIC_`, never browser code).
4. Apply migrations in order (see README “Database migrations”; `supabase db
   push` or per-file `psql`). Re-run is safe (idempotent policies/triggers).
5. Verify RLS:
   - `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'`
     — every application table must show `rowsecurity = true`.
   - `SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'`
     — expect the `0002` + `0005` policy sets (typed approvals, risk-domain,
     role-request, document-matrix, storage-object policies).
   - No `USING (true)` / `WITH CHECK (true)` on sensitive tables.
6. Load seed data for the target environment (see `seed/`).

## Storage configuration

- Buckets (private): `project-documents`, `task-attachments` (created by
  migration `0004`; keep **private**).
- Object policies (migration `0005`) mirror metadata authorization:
  `storage_documents_select/insert/delete` consult
  `smartsprint_can_read_storage_object`, so users denied metadata access
  cannot fetch objects via signed URLs or direct access.
- Application download flow mints 5-minute signed URLs server-side after a
  metadata-access check (`POST /api/documents/[id]`,
  `POST /api/tasks/[id]/attachments` with `{"action":"signed-url"}`).

## Environment variables (production)

Required: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
AI: `AI_API_KEY` (or `OPENAI_API_KEY`) + optional `AI_MODEL`
(default `gpt-4o-mini`); without a key the deterministic fallback engine
serves AI endpoints.

## Operations

- Role changes: only via `role_change_requests`; monitor pending requests
  (`GET /api/role-requests?status=pending`) and the audit log
  (`GET /api/admin/audit`). A lone ADMIN's self-request stays pending until
  a second ADMIN exists — onboard the second ADMIN via invitation + approval
  before demoting anyone.
- AI risk detection runs synchronously with monitoring evaluation; there is
  no scheduler to operate in MVP. Rejected insights are never resurfaced;
  genuinely new issues create fresh insights.
- Never bypass RLS with the service-role key for user reads; the trusted
  lane is for provisioning, system notifications, audit writes, and signed
  URLs only.
