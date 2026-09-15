# AI Layer

This directory contains all AI-related functionality for SmartSprint AI.

## Purpose

- AI service integrations (LLM providers)
- Prompt engineering and management
- AI response schemas and validation
- Model evaluation and testing
- AI-powered features (prioritization, estimation, etc.)

## Structure

```
ai/
├── services/          # AI service integrations
│   ├── llm.client.ts
│   ├── prioritization.service.ts
│   ├── estimation.service.ts
│   └── recommendation.service.ts
├── prompts/           # Prompt templates and management
│   ├── prioritization.prompt.ts
│   ├── estimation.prompt.ts
│   ├── sprint-planning.prompt.ts
│   └── templates/
├── schemas/           # AI response validation schemas
│   ├── prioritization.schema.ts
│   ├── estimation.schema.ts
│   └── recommendation.schema.ts
├── evaluators/        # Model evaluation and testing
│   ├── prioritization.eval.ts
│   ├── benchmarks/
│   └── metrics.ts
└── README.md          # This file
```

## Guidelines

- Isolate AI provider dependencies in services
- Version prompts for reproducibility
- Validate all AI responses with schemas
- Track token usage and costs
- Implement fallback strategies
- Log all AI interactions for debugging

## Integration Points

- Called from `src/services/ai.service.ts`
- Stores predictions in `ai_predictions` table
- Uses Supabase Edge Functions for async processing