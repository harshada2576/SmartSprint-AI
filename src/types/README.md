# Shared Application Types

This directory contains shared TypeScript types used across the application.

## Purpose

- Domain types (entities, value objects)
- DTOs (Data Transfer Objects)
- API response types
- Shared enums and constants

## Structure

```
src/types/
├── domain/           # Core domain types
│   ├── project.ts
│   ├── sprint.ts
│   ├── requirement.ts
│   ├── task.ts
│   ├── user.ts
│   └── team.ts
├── dto/              # Data Transfer Objects
├── api/              # API-specific types
├── enums.ts          # Shared enums
├── index.ts          # Barrel export
└── README.md
```

## Guidelines

- Prefer types over interfaces for unions/intersections
- Export types from domain modules
- Keep DTOs separate from domain types
- Use branded types for IDs where beneficial