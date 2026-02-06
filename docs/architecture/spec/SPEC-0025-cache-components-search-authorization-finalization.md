---
spec: SPEC-0025
title: Cache Components + search authorization + doc alignment finalization
version: 0.1.2
date: 2026-02-06
owners: ["Bjorn Melin"]
status: Implemented
related_requirements:
  [
    "FR-020",
    "PR-002",
    "NFR-003",
    "IR-003",
    "NFR-011",
    "NFR-015"
  ]
related_adrs: ["ADR-0013", "ADR-0020"]
related_specs: ["SPEC-0020", "SPEC-0021"]
notes: "Execution spec for cache-components-enabled search completion with per-user authorization, Zod-validated query contracts, Upstash rate limiting, and final documentation drift removal."
---

## Summary

This spec finalizes the search and cache components workstream by closing security,
contract, and documentation gaps that remained after initial implementation.

Goals:

- Enforce per-user project ownership for all project-bound reads/writes.
- Keep Next.js 16 Cache Components enabled with correct tag invalidation behavior.
- Finalize global and project search UX plus API hardening.
- Apply server-side search abuse guardrails using Upstash Ratelimit.
- Remove implementation/doc drift across specs, ADRs, README, PRD, and AGENTS.

## Scope

### In scope

- `projects.owner_user_id` schema ownership model and migration/backfill.
- User-scoped DAL and route/action enforcement for all project/run/chat/upload/search paths.
- `/api/search` query validation hardening using Zod v4 strict parsing.
- Search rate limiting using `@upstash/ratelimit` and Upstash Redis.
- Cache tags and write-path invalidation coverage review and fixes.
- Documentation and status updates to mark implemented work accurately.

### Out of scope

- Multi-user team RBAC (`project_members`) and invite flows.
- Semantic reranking redesign outside current retrieval architecture.
- Breaking API response redesign for existing clients.

## Decisions

1. Ownership model: every project has exactly one `owner_user_id` (Neon Auth user id).
2. Authorization policy: inaccessible project-bound resources resolve as not found or forbidden without cross-tenant leakage.
3. Search contract: backward-compatible with existing `q` and `projectId` behavior while adding validated `scope`, `types`, `limit`, and `cursor`.
4. Cache invalidation: tag-based invalidation (`revalidateTag(..., "max")`) for mutation paths.
5. Search abuse control: user/IP keyed Upstash rate limiting in route handler.

## Interfaces and Contracts

### Database

- `projects` adds:
  - `owner_user_id` (`text`, non-null after backfill)
  - owner index for list and scoped lookups

### Data access API

- `createProject` requires `ownerUserId`.
- New scoped read helpers:
  - `getProjectByIdForUser(projectId, userId)`
  - `getProjectBySlugForUser(slug, userId)` (if used)
- `listProjects(userId)` performs real DB ownership filtering.

### Search API

- `GET /api/search` accepts:
  - `q` (required, bounded length)
  - `scope` (`global | project`, optional)
  - `projectId` (required when `scope=project`)
  - `types` (subset of allowed domains)
  - `limit` (bounded)
  - `cursor` (optional, validated shape)
- Response remains compatible with existing shape and includes `meta`.

## Implementation Plan

### Phase 1: Ownership model and migration

- Add `owner_user_id` to schema and migration with backfill strategy.
- Backfill legacy rows with sentinel owner `legacy-unowned` so pre-existing seed
  rows are quarantined from normal user-scoped queries.
- Create project writes persist owner id from authenticated user.
- Project list/detail DAL enforces owner filtering.

### Phase 2: Resource-level authorization enforcement

- Replace unscoped project lookups in:
  - app routes
  - route handlers
  - server actions
  - run/chat orchestration entrypoints
- Ensure route handlers always derive user id from `requireAppUserApi`.

### Phase 3: Search hardening

- Replace ad-hoc query parsing with strict Zod schema normalization.
- Apply ownership scoping to global and project search query branches.
- Keep legacy compatibility behavior.

### Phase 4: Upstash operational guardrails

- Add `src/lib/upstash/ratelimit.server.ts`.
- Add server-side search limit checks and 429 behavior.
- Keep Redis usage namespaced and TTL-explicit.
- Harden async ingestion fetches by validating Blob URL host/protocol/path prior
  to `fetch()` in `POST /api/jobs/ingest-file`.

### Phase 5: Cache correctness

- Ensure mutation paths revalidate impacted tags:
  - project create
  - upload + ingest completion
  - artifact create/version
- Avoid high-cardinality caching in `/api/search`.

### Phase 6: Docs and status alignment

- Update SPEC-0020/SPEC-0021 completion sections.
- Update ADR-0013/ADR-0020 implementation truth.
- Update README/PRD/AGENTS/docs architecture and ops env references to remove “planned/spec’d” drift.
- Set implemented statuses where complete.

## Tests and Acceptance

### Required tests

- Authorization:
  - cross-user project access denied
  - global search only returns owned resources
- Search validation:
  - invalid query params produce deterministic 400 responses
  - legacy query format still works
- Rate limiting:
  - repeated calls eventually return 429
- Ingestion hardening:
  - untrusted blob hosts and project/path mismatches fail before network fetch
- Cache invalidation:
  - project/upload/artifact mutations call expected `revalidateTag` values

### Acceptance gates

- `bun run format`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`

## Assumptions

- Neon Auth user ids are stable and available in all protected handlers.
- Existing local projects are test/fake and safe to backfill.
- Upstash Redis and Vector env vars are configured in active environments.
- Team RBAC is deferred; single-owner model is sufficient for this release.
