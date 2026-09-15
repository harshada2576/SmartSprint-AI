# Documentation

This directory contains all project documentation.

## Structure

```
docs/
├── architecture/      # System architecture documentation
│   ├── overview.md
│   ├── frontend.md
│   ├── backend.md
│   ├── database.md
│   └── ai.md
├── database/          # Database documentation
│   ├── schema.md
│   ├── migrations.md
│   ├── seed-data.md
│   ├── rls-policies.md
│   └── erd.md
├── api/               # API documentation
│   ├── rest-api.md
│   ├── graphql-api.md
│   ├── authentication.md
│   ├── rate-limiting.md
│   └── endpoints/
├── ai/                # AI documentation
│   ├── overview.md
│   ├── models.md
│   ├── prompts.md
│   ├── evaluation.md
│   └── privacy.md
├── deployment/        # Deployment documentation
│   ├── environments.md
│   ├── ci-cd.md
#    ├── supabase-setup.md
│   ├── edge-functions.md
│   └── monitoring.md
└── README.md          # This file
```

## Documentation Standards

- Use Markdown format
- Keep documentation near the code it describes
- Update docs with code changes
- Use diagrams where helpful (Mermaid)
- Version API documentation