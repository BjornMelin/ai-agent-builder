---
ADR: 0021
Title: Environment configuration contracts and secret handling
Status: Implemented
Version: 0.1
Date: 2026-01-30
Supersedes: []
Superseded-by: []
Related: [ADR-0017, ADR-0015]
Tags: [security, configuration]
References:
  - https://nextjs.org/docs/app/guides/environment-variables
  - https://zod.dev/
---

## Status

Implemented — 2026-01-30.

## Description

Centralize environment variable access behind a single typed module, and enforce
server-only secret handling.

## Context

ai-agent-builder integrates several providers (DB, Upstash, QStash, AI Gateway,
Blob, Exa, Firecrawl, Sandbox, MCP). These integrations require secrets and
configuration, and incorrect configuration should fail clearly without breaking
optional features or leaking secrets to client bundles.

## Decision Drivers

- Avoid secret exposure to client bundles
- Clear, typed configuration contracts (Zod v4)
- Feature-gated validation to keep optional features optional
- Consistent error behavior for Route Handlers and Server Actions

## Related Requirements

- **NFR-001:** Protect server-only keys and secrets.
- **NFR-003:** Strict TypeScript and modular configuration contracts.

## Alternatives

- A: Read `process.env` directly everywhere
  - Pros: minimal upfront work.
  - Cons: untyped, inconsistent errors, easy to leak secrets.
- B: Parse all env vars at module import time
  - Pros: fail-fast at startup.
  - Cons: optional features break builds/deploys; harder local iteration.

### Decision Framework

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.4 | 3.29 |
| Application value | 0.30 | 9.2 | 2.76 |
| Maintenance & cognitive load | 0.25 | 9.1 | 2.28 |
| Architectural adaptability | 0.10 | 9.2 | 0.92 |

**Total:** 9.25 / 10.0

## Decision

- `src/lib/env.ts` is the only place in `src/**` that reads `process.env`.
- `src/lib/env.ts` is server-only (`server-only`) and must not be imported from
  Client Components.
- Each integration validates its required variables only when accessed
  ("feature gates").
- Misconfiguration fails at runtime on first usage with an `AppError` and a
  clear message listing missing/invalid variables.

## Constraints

- No secrets in client bundles.
- No env validation that fails builds for unused features.
- Tooling configs may still read env directly (e.g. `drizzle.config.ts`).

## Testing

- Unit tests cover env feature gates and error normalization.
- CI enforces format/lint/typecheck/test/build.

## Implementation Notes

- Added:
  - `src/lib/env.ts`
  - `src/lib/errors.ts`
  - `src/lib/log.ts`
  - `src/lib/ids.ts`
  - `src/lib/time.ts`
  - `src/lib/upstash/redis.ts`
  - `src/lib/upstash/qstash.ts`
  - `src/lib/env.test.ts`
  - `src/lib/errors.test.ts`
  - `src/lib/log.test.ts`
  - `docs/ops/env.md`
- Updated:
  - `.env.example`
  - `vitest.config.ts`

## Dependencies

- **Added**: server-only

## Changelog

- **0.1 (2026-01-30)**: Implemented typed env feature gates and server-only
  secret handling.
