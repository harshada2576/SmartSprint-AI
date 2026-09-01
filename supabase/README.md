# Supabase Infrastructure

This directory contains all Supabase-specific infrastructure including database schema, migrations, seed data, and Edge Functions.

## Structure

```
supabase/
├── migrations/          # Database migrations (managed by Drizzle Kit)
│   ├── 0000_initial_schema.sql
│   ├── relations.ts     # Drizzle relations
│   └── meta/           # Drizzle migration metadata
├── functions/           # Supabase Edge Functions (Deno)
├── seed/               # Database seeding infrastructure
│   ├── data/           # Static seed data (JSON/CSV)
│   ├── generators/     # Data generation scripts
│   └── validators/     # Seed data validation
├── schema.ts           # Drizzle schema definition (source of truth)
├── client.ts           # Database client (Drizzle + pg Pool)
└── README.md           # This file
```

## Database Schema

The schema is defined in `schema.ts` using Drizzle ORM. It includes:

- **Core tables**: users, teams, projects, sprints, requirements, tasks
- **Relationship tables**: team_members, project_members, backlog
- **AI tables**: ai_predictions
- **Operational tables**: invitations, activity_logs, notifications
- **Enums**: All PostgreSQL enums for status, priority, categories, etc.

## Migrations

Migrations are managed by Drizzle Kit:

```bash
# Generate new migration after schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate

# Push schema directly (development only)
npm run db:push
```

## Seeding

```bash
# Run seed data
npm run db:seed
```

## Edge Functions

Edge Functions live in `functions/` and are deployed to Supabase:

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy function-name
```

## Environment Variables

Required environment variables (see `.env.example`):

- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-only)