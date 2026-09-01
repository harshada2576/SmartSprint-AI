# SmartSprint AI — Agent Ownership & Architecture Guide

This document defines the repository architecture, directory ownership, and rules for multi-agent development.

---

## Project Architecture Overview

```
SmartSprint-AI/
├── frontend/ (src/app, src/components, src/lib)  ← FROZEN
├── supabase/                                      ← Database & Infra
│   ├── migrations/
│   ├── functions/
│   ├── seed/
│   ├── schema.ts
│   └── client.ts
├── src/                                           ← Application Layer
│   ├── api/
│   ├── services/
│   ├── repositories/
│   ├── schemas/
│   ├── types/
│   └── utils/
├── ai/                                            ← AI Layer
│   ├── services/
│   ├── prompts/
│   ├── schemas/
│   └── evaluators/
├── tests/                                         ← Tests
│   ├── database/
│   ├── api/
│   ├── auth/
│   ├── edge-functions/
│   └── ai/
├── docs/                                          ← Documentation
│   ├── architecture/
│   ├── database/
│   ├── api/
│   ├── ai/
│   └── deployment/
├── scripts/                                       ← Utility Scripts
├── AGENTS.md                                      ← This file
├── .env.example                                   ← Environment template
├── drizzle.config.ts                              ← Drizzle config
├── package.json
└── tsconfig.json
```

---

## Agent Ownership Matrix

### Frontend Agent
**Owns:**
- `src/app/**` — All Next.js App Router pages, layouts, route handlers
- `src/components/**` — All React components (UI, layout)
- `src/lib/**` — Frontend utilities (cn, formatting, constants)

**Must NOT modify:**
- `supabase/**` — Database schema, migrations, seed, Edge Functions
- `src/api/**` — API route handlers (backend logic)
- `src/services/**` — Business logic services
- `src/repositories/**` — Data access layer
- `src/schemas/**` — Validation schemas
- `src/types/domain/**` — Core domain types
- `ai/**` — AI services, prompts, evaluators
- `tests/**` — Test files (except frontend component tests)
- `docs/**` — Documentation

**Rules:**
- Frontend is **FROZEN** for UI/UX — no visual changes without explicit approval
- May consume types from `src/types/` and `@supabase/*`
- May call API routes from `src/api/` via fetch/client
- Must not import from `supabase/`, `src/services/`, `src/repositories/` directly

---

### Database Agent
**Owns:**
- `supabase/migrations/**` — All SQL migrations
- `supabase/schema.ts` — Drizzle schema (source of truth)
- `supabase/client.ts` — Database client configuration
- `supabase/seed/**` — Seed data infrastructure
- `drizzle.config.ts` — Drizzle Kit configuration
- `docs/database/**` — Database documentation

**Must NOT modify:**
- `src/app/**` — Frontend pages
- `src/components/**` — Frontend components
- `src/lib/**` — Frontend utilities
- `ai/**` — AI layer

**Rules:**
- All schema changes via migrations only
- Never edit applied migrations
- `supabase/schema.ts` is the single source of truth
- Run `npm run db:generate` after schema changes
- Service role key never in frontend code

---

### Backend/API Agent
**Owns:**
- `src/api/**` — API route handlers, client utilities
- `src/services/**` — Business logic services
- `src/repositories/**` — Data access repositories
- `src/schemas/**` — Validation schemas (Zod)
- `src/types/**` — Shared application types (domain, DTOs, API)
- `src/utils/**` — Shared utilities (non-frontend)

**Must NOT modify:**
- `src/app/**` — Frontend pages (except API routes in `src/app/api/`)
- `src/components/**` — Frontend components
- `supabase/migrations/**` — Migrations (coordinate with Database Agent)
- `supabase/functions/**` — Edge Functions (coordinate with Edge Function Agent)
- `ai/**` — AI implementation (coordinate with AI Agent)

**Rules:**
- API routes delegate to services
- Services use repositories for data access
- Repositories use Drizzle from `@supabase/client`
- Validate all inputs with schemas from `src/schemas/`
- Return consistent error formats

---

### Edge Function Agent
**Owns:**
- `supabase/functions/**` — All Supabase Edge Functions (Deno)

**Must NOT modify:**
- `src/app/**` — Frontend
- `supabase/migrations/**` — Migrations
- `src/services/**` — Application services
- `ai/**` — AI layer

**Rules:**
- Deno runtime, no Node.js APIs
- Use `SUPABASE_SERVICE_ROLE_KEY` for admin operations
- Deploy via `supabase functions deploy`
- Keep functions small and focused

---

### AI Agent
**Owns:**
- `ai/services/**` — AI service integrations
- `ai/prompts/**` — Prompt templates and management
- `ai/schemas/**` — AI response validation
- `ai/evaluators/**` — Model evaluation and benchmarks
- `docs/ai/**` — AI documentation

**Must NOT modify:**
- `src/app/**` — Frontend UI
- `supabase/schema.ts` — Database schema (coordinate with Database Agent)
- `supabase/migrations/**` — Migrations
- `src/services/**` — Application services (coordinate with Backend Agent)

**Rules:**
- All AI provider calls through `ai/services/`
- Prompts versioned and tested
- Responses validated with `ai/schemas/`
- Token usage and costs tracked
- Evaluation runs in `tests/ai/`

---

### Testing Agent
**Owns:**
- `tests/**` — All test directories
- Test configuration and setup

**Must NOT modify:**
- Source code (except to add test IDs, fix testability)
- Production code to make tests pass

**Rules:**
- Unit tests co-located with source (`*.test.ts`)
- Integration tests in `tests/`
- E2E tests in `tests/e2e/`
- Use test database for integration tests
- Mock external services
- Test RLS policies thoroughly

---

### Documentation Agent
**Owns:**
- `docs/**` — All documentation

**Must NOT modify:**
- Source code
- Configuration files

**Rules:**
- Update docs with code changes
- Use Mermaid for diagrams
- Keep API docs in sync with OpenAPI spec

---

## Critical Rules

### Frontend Freeze Rule
The frontend (`src/app`, `src/components`, `src/lib`) is **FROZEN** for UI/UX.
- No layout, color, typography, spacing, navigation changes
- No component modifications for visual reasons
- No page structure or UX behavior changes
- Only changes allowed: bug fixes, data integration, accessibility fixes

### Database Change Rule
- All schema changes via Drizzle migrations in `supabase/migrations/`
- Never edit applied migration files
- `supabase/schema.ts` is the single source of truth
- Coordinate with Backend Agent for API impact

### Migration Rule
```bash
# After schema.ts changes:
npm run db:generate    # Creates migration in supabase/migrations/
npm run db:migrate     # Applies to database
```

### Environment/Secrets Rule
- Never commit `.env`, `.env.local`, or any secrets
- `.env.example` documents required variables only
- `SUPABASE_SERVICE_ROLE_KEY` only in server/Edge Function code
- Frontend only uses `NEXT_PUBLIC_*` variables

### Testing Requirements
- All new API routes: integration tests in `tests/api/`
- All new services: unit tests co-located
- All schema changes: migration tests in `tests/database/`
- All RLS changes: tests in `tests/auth/`
- All AI features: evaluation tests in `tests/ai/`

### No Destructive Changes
- Never delete or rename files owned by another agent without coordination
- Never force-push to shared branches
- Never remove tests without replacement

### No Unrelated Refactoring
- Stay in your owned directories
- Don't "clean up" code outside your ownership
- Don't reorganize imports unless fixing a break

### No Overwriting Another Agent's Work
- Check git status before starting
- Communicate via PRs/issues for cross-cutting changes
- Respect ownership boundaries

### Inspect Before Modify
- Read existing code before changing it
- Understand patterns and conventions
- Follow existing code style

---

## TypeScript Path Aliases

```json
{
  "@/*": "./src/*",
  "@supabase/*": "./supabase/*"
}
```

Use `@supabase/client` for database access, `@/api` for API client, `@/types` for shared types.

---

## Commands Reference

```bash
# Development
npm run dev              # Start Next.js dev server

# Database
npm run db:generate      # Generate migration from schema.ts
npm run db:migrate       # Apply migrations
npm run db:push          # Push schema directly (dev only)
npm run db:seed          # Run seed scripts
npm run db:studio        # Open Drizzle Studio

# Code Quality
npm run lint             # ESLint
npm run typecheck        # TypeScript check
npm run build            # Next.js production build

# Supabase
supabase functions deploy        # Deploy all Edge Functions
supabase functions deploy <name> # Deploy specific function

# Testing
npm run test:unit        # Unit tests
npm run test:integration # Integration tests
npm run test:e2e         # E2E tests
```

---

## Getting Started for New Agents

1. Read this entire `AGENTS.md`
2. Identify your agent role and owned directories
3. Review existing code in your owned directories
4. Check `docs/` for relevant documentation
5. Run `npm run typecheck` and `npm run lint` to verify setup
6. Make changes only in your owned directories
7. Write/update tests in `tests/`
8. Update relevant documentation in `docs/`
9. Submit PR for review