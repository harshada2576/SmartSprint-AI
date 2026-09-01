# Scripts

This directory contains utility scripts for development, deployment, and maintenance.

## Structure

```
scripts/
├── db/
│   ├── seed.ts           # Database seeding script
│   ├── migrate.ts        # Migration runner
│   └── reset.ts          # Database reset
├── ai/
│   ├── evaluate.ts       # AI model evaluation
│   └── benchmark.ts      # Performance benchmarks
├── deploy/
│   ├── edge-functions.ts # Deploy Edge Functions
│   └── vercel.ts         # Vercel deployment
├── utils/
│   ├── generate-types.ts # Generate types from schema
│   └── lint-fix.ts       # Auto-fix linting
└── README.md             # This file
```

## Usage

```bash
# Run database seed
npx tsx scripts/db/seed.ts

# Run migrations
npx tsx scripts/db/migrate.ts

# Evaluate AI models
npx tsx scripts/ai/evaluate.ts
```

## Guidelines

- Use TypeScript (tsx) for scripts
- Keep scripts focused and single-purpose
- Document required environment variables
- Handle errors gracefully
- Log progress for long-running scripts