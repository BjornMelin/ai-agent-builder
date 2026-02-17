# Build Runtime Policy

This project uses a Bun-only build strategy for local, CI, and deployment
builds.

## Goals

- Keep Bun as the only supported runtime for installs and scripts.
- Maintain consistent behavior across local, CI, and deployment builds.

## Build entrypoints

- `bun run build`
  - Runs `bun --bun next build --webpack`.
- `bun run build:strict-bun`
  - Runs `bun --bun next build --webpack`.

`bun run build` is the default local/general entrypoint. `bun run build:strict-bun`
is the CI/strict alias used for canary visibility and future divergence; it is
intentionally equivalent today for reproducibility, but reserved for stricter
environment enforcement or flags without changing developer defaults.

## CI policy

- Primary CI build job runs `bun run build`.
- A separate non-blocking canary job runs `bun run build:strict-bun` and uploads
  logs as an artifact.

## Vercel policy

- `vercel.json` uses:
  - `buildCommand: bun run build:vercel`
  - `installCommand: bun install --frozen-lockfile`
  - `bunVersion: 1.x`

This keeps dependency installs reproducible while preserving Bun runtime support
for the deployed project.
