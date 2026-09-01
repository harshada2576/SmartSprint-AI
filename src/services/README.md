# Services Layer

This directory contains business logic services for the application.

## Purpose

- Encapsulate business logic and workflows
- Coordinate between repositories
- Implement use cases
- Handle transactions

## Structure

```
src/services/
├── project.service.ts
├── sprint.service.ts
├── requirement.service.ts
├── task.service.ts
├── user.service.ts
├── team.service.ts
├── ai.service.ts
├── notification.service.ts
└── README.md
```

## Guidelines

- Services should be stateless
- Inject repositories as dependencies
- Handle business rules and validation
- Return domain objects or DTOs
- Throw domain-specific errors