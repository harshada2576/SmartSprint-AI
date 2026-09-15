# Application API Layer

This directory contains API/data-access abstractions for the application.

## Purpose

- API route handlers (Next.js App Router route.ts files)
- Data fetching utilities for Server Components
- API client utilities for frontend consumption
- Request/response types

## Structure

```
src/api/
├── routes/           # Next.js API route handlers
├── client/           # Frontend API client utilities
├── types/            # API request/response types
└── README.md         # This file
```

## Guidelines

- Keep API routes thin - delegate to services/repositories
- Use validation schemas from `src/schemas/`
- Return consistent error responses
- Follow REST conventions where applicable