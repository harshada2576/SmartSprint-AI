# Validation Schemas

This directory contains validation schemas using Zod (or similar).

## Purpose

- Request body validation
- Query parameter validation
- Form validation
- Type inference from schemas

## Structure

```
src/schemas/
├── project.schema.ts
├── sprint.schema.ts
├── requirement.schema.ts
├── task.schema.ts
├── user.schema.ts
├── team.schema.ts
├── auth.schema.ts
├── common.schema.ts
└── README.md
```

## Guidelines

- Use Zod for schema definition
- Export inferred types
- Compose reusable schema pieces
- Keep schemas close to API contracts