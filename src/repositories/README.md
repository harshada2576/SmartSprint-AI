# Repositories Layer

This directory contains data access repositories.

## Purpose

- Abstract database operations
- Provide clean interface for data access
- Encapsulate query logic
- Enable testing with mock implementations

## Structure

```
src/repositories/
├── project.repository.ts
├── sprint.repository.ts
├── requirement.repository.ts
├── task.repository.ts
├── user.repository.ts
├── team.repository.ts
├── ai.repository.ts
├── base.repository.ts
└── README.md
```

## Guidelines

- One repository per aggregate root
- Use Drizzle query builder
- Return typed entities
- Handle pagination, filtering, sorting
- No business logic - only data access