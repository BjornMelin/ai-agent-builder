# Build Runtime Policy

This project uses a Bun-only build strategy for local, CI, and deployment
builds.

## Goals

- Keep Bun as the only supported runtime for installs and scripts.
- Maintain consistent behavior across local, CI, and deployment builds.

## Build entrypoints

- `bun run build`
  - Runs `bun --bun next build` through the native Next.js and Workflow integration.
- `bun run build:vercel`
  - Applies database migrations, then runs `bun run build`.

`next.config.ts` is wrapped with `withWorkflow`. Do not add Workflow-specific webpack loaders, loader-removal rules, or a second build alias.

## CI policy

- CI runs separate lint, Knip, typecheck, and sharded Vitest jobs.
- The build job runs `bun run build` after those jobs pass.
- Custom runners selected through `ACTIONS_RUNNER_LABELS` must run Actions
  Runner 2.327.1 or newer because the pinned actions use the Node.js 24 runtime.

## Vercel policy

- `vercel.json` uses:
  - `buildCommand: bun run build:vercel`
  - `installCommand: bun install --frozen-lockfile`
  - `bunVersion: 1.x`

This keeps dependency installs reproducible while preserving Bun runtime support
for the deployed project.
