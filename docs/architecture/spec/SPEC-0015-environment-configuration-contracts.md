---
spec: SPEC-0015
title: Environment configuration contracts
version: 0.2.0
date: 2026-02-01
owners: ["you"]
status: Implemented
related_requirements:
  [
    "NFR-001",
    "NFR-003",
    "NFR-010",
    "NFR-013",
    "NFR-015",
    "IR-001",
    "IR-002",
    "IR-003",
    "IR-004",
    "IR-006",
    "IR-007",
    "IR-008",
    "IR-009",
    "IR-011",
    "IR-012",
    "IR-013",
    "IR-014",
  ]
related_adrs: ["ADR-0021"]
notes:
  "Defines env var contracts and a single typed access module with feature-gated
  validation."
---

## Summary

Defines environment variable contracts and a single typed access module
(`src/lib/env.ts`) with feature-gated validation.

## Context

This system integrates multiple external providers (DB, caching, workflows,
storage, research, sandbox). Secrets must remain server-only, and configuration
errors must be explicit and easy to debug without breaking optional features.

The implementation engine adds optional integrations (GitHub/Vercel APIs and
optional provisioning APIs), which must remain feature-gated.

## Goals / Non-goals

### Goals

- Single env access surface for `src/**` server code
- Typed parsing/validation using Zod v4
- Feature-gated validation (only fails when a feature is first used)
- No secrets leaked to client bundles

### Non-goals

- Client-side env access (no `NEXT_PUBLIC_*` config in scope)
- Supporting multiple variable aliases for the same secret

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Non-functional requirements

- **NFR-001**
- **NFR-003**
- **NFR-010**

### Integration requirements (if applicable)

- **IR-001**
- **IR-002**
- **IR-003**
- **IR-004**
- **IR-006**
- **IR-007**
- **IR-008**
- **IR-009**
- **IR-011**
- **IR-012**
- **IR-013**
- **IR-014**

## Constraints

- No direct `process.env` reads in `src/**` (tooling configs may be exceptions,
  e.g. `drizzle.config.ts`).
- `@/lib/env` is server-only and must never be imported from Client Components.
- Missing/invalid required variables fail at runtime at the first usage site,
  with a clear error message listing the variable(s).

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.4 | 3.29 |
| Application value | 0.30 | 9.2 | 2.76 |
| Maintenance & cognitive load | 0.25 | 9.2 | 2.30 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.26 / 10.0

## Design

### Architecture overview

- `src/lib/env.ts` is the only module that reads `process.env`.
- `src/lib/env.ts` uses `server-only` to prevent accidental client imports.
- Each feature has its own schema (DB, Upstash, QStash publish/verify, AI
  Gateway, research, blob, sandbox, auth).
- Schemas are validated lazily via property getters and cached on first access.
- Env validation errors are thrown as `AppError` with code `env_invalid`.

### Feature gates

Feature gates are accessed through `env.<feature>`:

- `env.db` (`DATABASE_URL`)
- `env.upstash` (`UPSTASH_*`)
- `env.qstashPublish` (`QSTASH_TOKEN`)
- `env.qstashVerify` (`QSTASH_*_SIGNING_KEY`)
- `env.aiGateway` (`AI_GATEWAY_*`)
- `env.webResearch` (`EXA_API_KEY`, `FIRECRAWL_API_KEY`)
- `env.blob` (`BLOB_READ_WRITE_TOKEN`)
- `env.sandbox` (`VERCEL_OIDC_TOKEN`)
- `env.auth`
  - Neon Auth: `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEON_AUTH_COOKIE_DOMAIN`
  - App access control: `AUTH_ACCESS_MODE`, `AUTH_ALLOWED_EMAILS`

Implementation/deploy automation (optional feature gates):

- `env.github` (`GITHUB_TOKEN`, optional `GITHUB_WEBHOOK_SECRET`)
- `env.vercelApi` (`VERCEL_TOKEN`, optional `VERCEL_TEAM_ID`)
- `env.neonApi` (`NEON_API_KEY`)
- `env.upstashDeveloper` (`UPSTASH_EMAIL`, `UPSTASH_API_KEY`)

## Acceptance criteria

- [x] `src/lib/env.ts` is the single typed env access module.
- [x] Feature-gated validation: missing vars do not fail until the feature is
  accessed.
- [x] No direct `process.env` usage in `src/**`.
- [x] `.env.example` lists all required/optional variables.
- [x] Ops documentation exists and explains each variable.

## Testing

- Unit tests cover env feature gates and error normalization.
- Run: `bun run test`

## Key files

- `src/lib/env.ts`
- `src/lib/errors.ts`
- `src/lib/log.ts`
- `src/lib/ids.ts`
- `src/lib/time.ts`
- `src/lib/upstash/redis.ts`
- `src/lib/upstash/qstash.ts`
- `src/lib/env.test.ts`
- `.env.example`
- `docs/ops/env.md`

## References

- Next.js environment variables:
  [Environment variables](https://nextjs.org/docs/app/guides/environment-variables)
- Zod:
  [Zod](https://zod.dev/)

## Changelog

- **0.1 (2026-01-30)**: Implemented typed env feature gates and ops docs.
- **0.2 (2026-01-31)**: Migrated `env.auth` to Neon Auth + allowlist access control.
