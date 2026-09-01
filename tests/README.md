# Tests

This directory contains all tests for the SmartSprint AI application.

## Structure

```
tests/
├── database/          # Database integration tests
│   ├── migrations.test.ts
│   ├── schema.test.ts
│   ├── seed.test.ts
│   └── rls.test.ts
├── api/               # API route tests
│   ├── projects.api.test.ts
│   ├── sprints.api.test.ts
│   ├── requirements.api.test.ts
│   └── tasks.api.test.ts
├── auth/              # Authentication & authorization tests
│   ├── auth.test.ts
│   ├── rls-policies.test.ts
│   └── permissions.test.ts
├── edge-functions/    # Supabase Edge Function tests
│   └── *.test.ts
├── ai/                # AI layer tests
│   ├── services.test.ts
│   ├── prompts.test.ts
│   ├── evaluators.test.ts
│   └── benchmarks/
├── unit/              # Unit tests (co-located with source)
├── integration/       # Integration tests
├── e2e/               # End-to-end tests (Playwright/Cypress)
├── fixtures/          # Test fixtures and factories
├── utils/             # Test utilities
├── setup.ts           # Global test setup
└── README.md          # This file
```

## Running Tests

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# All tests
npm run test
```

## Guidelines

- Unit tests co-located with source files (`*.test.ts`)
- Integration tests in `tests/` directory
- Use test database for integration tests
- Mock external services
- Test RLS policies thoroughly
- AI tests should use recorded responses (fixtures)