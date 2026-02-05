---
spec: SPEC-0015
title: Environment configuration contracts
version: 0.3.1
date: 2026-02-03
owners: ["Bjorn Melin"]
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

See [SPEC-0021](./SPEC-0021-full-stack-finalization-fluid-compute-neon-upstash-ai-elements.md)
for the cross-cutting “finalization” plan that records the current env var
defaults and the remaining work to finalize full-stack behavior.

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

- Client-side env secrets or broad client config surfaces. The only allowed
  `NEXT_PUBLIC_*` values are explicitly non-secret and documented (currently:
  `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS`).
- Supporting multiple variable aliases for the same secret.

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Non-functional requirements

- **NFR-001 (Security):** Protect all sensitive routes, server-only keys, secure
  cookies.
- **NFR-003 (Maintainability):** Strict TS, Zod v4, modular architecture, low
  boilerplate.
- **NFR-010 (Quality gates):** CI enforces format/lint/typecheck/test/build with
  Bun-only commands.

### Integration requirements (if applicable)

- **IR-001:** All model/embedding calls through Vercel AI Gateway.
- **IR-002:** Relational store is Neon Postgres.
- **IR-003:** Cache and rate limit via Upstash Redis + Ratelimit.
- **IR-004:** Orchestrate durable jobs via Upstash QStash.
- **IR-006:** File storage via Vercel Blob.
- **IR-007:** Web research via Exa + Firecrawl.
- **IR-008:** Library docs via MCP (Context7).
- **IR-009:** Code execution via Vercel Sandbox.
- **IR-011:** Repo operations via GitHub (API + Git over HTTPS).
- **IR-012:** Deployments and env var management via Vercel API/SDK.
- **IR-013:** Optional: Provision Neon resources via Neon API.
- **IR-014:** Optional: Provision Upstash resources via Upstash Developer API.

## Constraints

- No direct `process.env` reads in `src/**` (tooling configs may be exceptions,
  e.g. `drizzle.config.ts`). Client Components may read
  `process.env.NEXT_PUBLIC_*` values directly.
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

- `src/lib/env.ts` is the only module that reads `process.env` for server code.
  Client Components may read `process.env.NEXT_PUBLIC_*` values directly.
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
- `env.sandbox`
  - OIDC token (preferred): `VERCEL_OIDC_TOKEN`
  - Access token fallback: `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (optional
    `VERCEL_TEAM_ID`)
- `env.auth`
  - Neon Auth: `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEON_AUTH_COOKIE_DOMAIN`
  - App access control: `AUTH_ACCESS_MODE`, `AUTH_ALLOWED_EMAILS`
- `env.authUi` (public; non-secret)
  - Auth UI social providers: `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS`

Implementation/deploy automation (optional feature gates):

- `env.github` (`GITHUB_TOKEN`, optional `GITHUB_WEBHOOK_SECRET`)
- `env.vercelApi` (`VERCEL_TOKEN`, optional `VERCEL_TEAM_ID`)
- `env.neonApi` (`NEON_API_KEY`)
- `env.upstashDeveloper` (`UPSTASH_EMAIL`, `UPSTASH_API_KEY`)

### Data contracts (if applicable)

- Env feature gates return normalized, typed objects. Consumers must not read
  raw `process.env`.
- Env parsing failures throw `AppError` with code `env_invalid` and a message
  that lists missing/invalid variables.

### File-level contracts

- `src/lib/env.ts`: single boundary for `process.env` reads; feature-gated getters.
- `docs/ops/env.md`: canonical docs for each variable and how it is used.
- `.env.example`: canonical set of variables for local setup.

### Configuration

- Add a new env var only by introducing a new feature gate (or extending an
  existing one) in `src/lib/env.ts`.
- Keep `.env.example` and `docs/ops/env.md` aligned with `src/lib/env.ts` (see
  `AGENTS.md` “Env var contract” rule).

## Acceptance criteria

- [x] `src/lib/env.ts` is the single typed env access module.
- [x] Feature-gated validation: missing vars do not fail until the feature is
  accessed.
- [x] No direct `process.env` usage in `src/**` server code (Client Components
  may read `process.env.NEXT_PUBLIC_*`).
- [x] `.env.example` lists all required/optional variables.
- [x] Ops documentation exists and explains each variable.

## Testing

- Unit tests cover env feature gates and error normalization.
- Run: `bun run test`

## Operational notes

- Prefer OIDC-based sandbox auth on Vercel; use access-token auth primarily for
  local development and external CI where OIDC is unavailable.
- Treat key rotation as a side-effectful operation: do not log secrets in
  plaintext and avoid persisting them in DB artifacts.

## Failure modes and mitigation

- Missing/invalid env vars → fail on first feature use with `AppError` and a
  message pointing to `docs/ops/env.md`.
- Accidental client import of `@/lib/env` → prevented by `server-only`; treat
  any bundler leak as a release blocker.

## Key files

- `src/lib/env.ts`
- `src/lib/core/errors.ts`
- `src/lib/core/log.ts`
- `src/lib/core/ids.ts`
- `src/lib/core/time.ts`
- `src/lib/upstash/redis.server.ts`
- `src/lib/upstash/qstash.server.ts`
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
- **0.3 (2026-02-01)**: Documented public auth UI env and client
  `NEXT_PUBLIC_*` exception; aligned env ops references.
- **0.3.1 (2026-02-03)**: Linked to SPEC-0021 as the cross-cutting finalization spec.
