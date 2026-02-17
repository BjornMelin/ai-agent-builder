# Build Runtime Policy

This project uses a Bun-first build strategy with deterministic fallback to keep
CI and deployment builds reliable.

## Goals

- Keep Bun as the primary path for local and Vercel builds.
- Prevent transient Bun/Turbopack failures from blocking release workflows.
- Avoid masking non-transient build errors.

## Build entrypoints

- `bun run build`
  - Runs `bash scripts/build-next.sh auto`.
  - Uses Bun first (`bun --bun next build`).
  - Retries Bun once after clearing `.next/cache` only when known transient
    Bun/Turbopack signatures are detected.
  - Falls back to Node (`node node_modules/next/dist/bin/next build`) only if
    Bun failed twice with known transient signatures.
- `bun run build:strict-bun`
  - Runs Bun-only build mode (no fallback).

## Known transient failure signatures

The fallback path is allowed only for these signatures:

- `failed to deserialize message`
- `failed to receive message`
- `Cannot find module '../package.json'`

If a Bun build fails without one of these signatures, the build fails
immediately and does not fallback.

## CI policy

- Primary CI build job runs `bun run build` (reliability path).
- A separate non-blocking canary job runs `bun run build:strict-bun` and uploads
  logs as an artifact.

## Vercel policy

- `vercel.json` uses:
  - `buildCommand: bun run build:vercel`
  - `installCommand: bun install --frozen-lockfile`
  - `bunVersion: 1.x`

This keeps dependency installs reproducible while preserving Bun runtime support
for the deployed project.
