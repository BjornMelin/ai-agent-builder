# AGENTS.md

This repo is optimized for agent-driven development (Codex + local automation).

## Non-negotiables

- **Bun only** for installs and scripts.
- **Next.js App Router** patterns only.
- **No manual memoization** (`useMemo`, `useCallback`).
- **Strict TypeScript** (no `any`).
- **Docs required** for exported APIs (TSDoc syntax enforced).

## Core commands

```bash
bun install                    # Install dependencies
bun run dev                    # Start development server
bun run build                  # Build for production
bun run format                 # Format code with Biome
bun run lint                   # Run Biome and ESLint
bun run typecheck              # Run TypeScript compiler checks
bun run test                   # Run tests with Vitest
bun run ci                     # Run format/lint/typecheck/test/build
bun run typegen                # Generate Next.js route/types without build
bun run db:generate            # Generate database migrations
bun run db:migrate             # Apply database migrations
bun run db:studio              # Open Drizzle Studio (requires DATABASE_URL)
bun run fetch:models           # Update AI model catalog (requires AI_GATEWAY_API_KEY)
```

## Formatting & linting

- Biome is the primary formatter/linter.
- ESLint is used for:
  - TSDoc syntax enforcement (`tsdoc/syntax`)
  - JSDoc policy on exported APIs (warn-level for iteration speed)

## Drizzle + database

- `drizzle.config.ts` reads `DATABASE_URL` at runtime; `bun run db:*` commands will fail fast if it's missing.
- Schema lives in `src/db/schema.ts` and migrations are generated into `src/db/migrations`.

## Database

- Drizzle schema: `src/db/schema.ts`
- Migrations: `src/db/migrations`

## AI Gateway

- Prefer `ai` package `gateway(...)` usage for model routing.
- OpenAI-compatible base URL is `https://ai-gateway.vercel.sh/v1`.
- `bun run fetch:models` writes a model catalog JSON (default: `docs/ai-gateway-models.json`).

## Definition of done (for any PR)

- `bun run format` clean
- `bun run lint` clean
- `bun run typecheck` clean
- `bun run test` clean
- `bun run build` clean
- No console spam in production paths
- Public/exported APIs have valid TSDoc
- Any env vars added are reflected in `.env.example`
