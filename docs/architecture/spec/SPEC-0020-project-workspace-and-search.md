---
spec: SPEC-0020
title: Project workspace and search UX
version: 0.1.1
date: 2026-02-03
owners: ["Bjorn Melin"]
status: Proposed
related_requirements: ["FR-002", "FR-019", "FR-020", "NFR-008", "IR-002", "IR-005"]
related_adrs: ["ADR-0011", "ADR-0004"]
notes:
  "Defines the user-facing workspace information architecture and search behavior."
---

## Summary

Defines the project workspace structure and search behavior across projects,
uploads, runs, artifacts, and connected repositories.

See [SPEC-0021](./SPEC-0021-full-stack-finalization-fluid-compute-neon-upstash-ai-elements.md)
for the cross-cutting “finalization” plan that ties the workspace UI into
ingestion, retrieval, chat, and durable runs.

## Context

The core experience of this product is the **project workspace**, where a user
uploads source materials, iterates via chat, runs durable research/spec
workflows, and (optionally) connects a target repo for end-to-end implementation
runs.

To stay usable at scale, the UI needs:

- a consistent information architecture per project
- fast, scoped search across project entities
- deep links back to the provenance of any result (artifact version, run step,
  upload page/slide, repo path)

## Goals / Non-goals

### Goals

- A consistent project workspace layout (tabs) that makes the app navigable as
  the number of uploads, runs, artifacts, and connected repos grows.
- Search that supports both global scope (all projects) and project scope.
- Search results that preserve provenance and can deep-link to the exact source
  location.
- Keyboard-first, screen-reader-friendly interactions for navigation and search.

### Non-goals

- A “universal” full-text search engine for arbitrary third-party systems.
- Multi-user collaboration and shared workspaces (out of scope for the private,
  allowlist-only, single-tenant product).

## Requirements

Requirement IDs are defined in [docs/specs/requirements.md](/docs/specs/requirements.md).

### Functional requirements

- **FR-002:** Project CRUD (create, view, edit, archive, delete).
- **FR-019:** Maintain project knowledge base from uploads + generated artifacts
  (retrievable).
- **FR-020:** Search across projects/files/runs/artifacts.

### Non-functional requirements

- **NFR-008 (Accessibility):** Keyboard-accessible and screen-reader-friendly UI.

### Performance / Reliability requirements (if applicable)

- None

### Integration requirements (if applicable)

- **IR-002:** Relational store is Neon Postgres.
- **IR-005:** Vector search via Upstash Vector (prefer HYBRID indexes when
  provisioning).

## Constraints

- Search must always respect access control boundaries:
  - project-scoped search must never leak data from other projects
  - global search must only return results the current user can access
- The UI must provide provenance for results (at minimum: project, result type,
  and a stable deep link).
- Search must degrade gracefully when an integration is unavailable:
  - vector store unavailable → fall back to metadata/title search in Postgres.

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.1 | 3.18 |
| Application value | 0.30 | 9.3 | 2.79 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.13 / 10.0

## Design

### Architecture overview

Per project, provide consistent tabs:

1. **Overview**
   - project summary
   - quick actions (new run, upload, export)
   - latest artifacts snapshot
2. **Uploads**
   - list originals, extraction status, metadata
3. **Chat**
   - project-scoped threads with agent mode selection
4. **Runs**
   - research runs and implementation runs timelines
   - step details, logs, approvals
5. **Artifacts**
   - versioned artifacts list (PRD, ADRs, SPECS, audit bundles)
   - diff between versions (optional)
   - deterministic export button
6. **Implementation**
   - repo connection status
   - implementation runs launcher and configuration

Search must support:

- global search (all projects)
- project-scoped search

Result types:

- projects (name, tags)
- files/uploads (filename, extracted text hits)
- artifacts (title/headings, content hits)
- run steps (errors, tool outputs)
- repo code (path + snippet) for connected repos

Query strategy:

Use a hybrid strategy:

1. **Metadata / titles**
   - Neon Postgres queries (ILIKE or full-text for titles and names; see
     [PostgreSQL ILIKE](https://www.postgresql.org/docs/current/functions-matching.html)
     and [PostgreSQL full-text search](https://www.postgresql.org/docs/current/textsearch.html))
2. **Content**
   - Upstash Vector retrieval over indexed chunks (uploads, artifacts, code; see
     [Upstash Vector](https://upstash.com/docs/vector))
   - prefer HYBRID indexes when available (see
     [Upstash Vector Hybrid Indexes](https://upstash.com/docs/vector/features/hybridindexes))

Merge results into a single ranked list with type-aware scoring.

Accessibility and UX:

- keyboard navigation for results
- filters by type (uploads/artifacts/runs/code)
- show provenance (project, artifact version, file page/slide, repo path)
- support deep links to the exact location

### Data contracts (if applicable)

- Search query (conceptual):
  - `scope`: `{ type: "global" } | { type: "project"; projectId: string }`
  - `q`: string
  - `filters`: optional (result types, date range, tags)
  - `limit`: number
  - `cursor`: optional string for pagination
- Search result item (conceptual):
  - `type`: `"project" | "upload" | "artifact" | "runStep" | "repoCode"`
  - `title`: string
  - `snippet`: string (highlighted excerpt)
  - `href`: string (deep link)
  - `provenance`:
    - `projectId`
    - optional: `artifactId` + `artifactVersionId`
    - optional: `uploadId` + `pageOrSlide`
    - optional: `runId` + `runStepId`
    - optional: `repoId` + `path` + `commitSha`

### File-level contracts

- `src/app/(app)/projects/page.tsx`: project list with search entrypoint.
- `src/app/(app)/projects/[projectId]/layout.tsx`: renders project-level tab
  navigation and ensures consistent deep-linkable URLs.
- `src/app/(app)/projects/[projectId]/*/page.tsx`: tab pages (uploads/chat/runs/
  artifacts/implementation).
- `src/app/(app)/projects/[projectId]/artifacts/page.tsx`: list latest artifacts.
- `src/app/(app)/projects/[projectId]/artifacts/[artifactId]/page.tsx`: artifact
  detail page (render markdown + citations + version links).
- *(Planned)* `src/app/(app)/search/page.tsx`: global search results (not yet implemented).
- `src/app/api/search/route.ts`: optional JSON search endpoint for typeahead; must
  enforce access control and scoping.
- `src/app/api/export/[projectId]/route.ts`: deterministic export ZIP for the
  latest artifact versions (plus citations).
- `src/lib/ai/tools/retrieval.server.ts`: orchestrates Upstash Vector retrieval
  (uploads + artifacts) with optional Redis caching.

### Configuration

- See [docs/ops/env.md](/docs/ops/env.md):
  - DB: `DATABASE_URL`
  - Upstash Vector: `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`
  - Optional caching: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## Acceptance criteria

- A user can create, open, edit, archive, and delete projects.
- The project workspace has stable, deep-linkable tabs with consistent URL
  structure.
- Global search returns scoped results across projects.
- Project search returns only entities within the project.
- Search results include provenance and deep links to the source location.
- Search UX is keyboard-accessible (focus order, arrow navigation, enter to
  open) and screen-reader-friendly.

## Testing

- Unit tests: result merging, ranking, and filter logic.
- Integration tests: search route handler enforces scoping and returns stable
  deep links.
- E2E tests: create project → upload → search → navigate to result.

## Operational notes

- Track search latency and error rates (see SPEC-0010).
- Treat “missing provenance” (result without deep link) as a bug; it breaks
  traceability.
- When using IR-005 (Upstash Vector HYBRID indexes), upserts must include both
  dense and sparse vectors or the operation fails (see
  [Upstash Vector Hybrid Indexes](https://upstash.com/docs/vector/features/hybridindexes)).

## Failure modes and mitigation

- Vector query failure → fall back to Postgres-only search with a UI warning.
- Slow queries on large datasets → add server-side bounds (limit + pagination)
  and cache hot queries where safe.
- Incorrect scoping → add regression tests for cross-project leakage.

## Key files

- [docs/architecture/spec/SPEC-0020-project-workspace-and-search.md](/docs/architecture/spec/SPEC-0020-project-workspace-and-search.md)
- [docs/specs/requirements.md](/docs/specs/requirements.md)
- [docs/architecture/spec/SPEC-0003-upload-ingestion-pipeline.md](/docs/architecture/spec/SPEC-0003-upload-ingestion-pipeline.md)
- [docs/architecture/spec/SPEC-0004-chat-retrieval-augmentation.md](/docs/architecture/spec/SPEC-0004-chat-retrieval-augmentation.md)
- [docs/architecture/spec/SPEC-0008-artifact-generation-versioning-and-export-zip.md](/docs/architecture/spec/SPEC-0008-artifact-generation-versioning-and-export-zip.md)

## References

- [Next.js: App Router routing](https://nextjs.org/docs/app/building-your-application/routing)
- [Next.js: Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [PostgreSQL: Text search](https://www.postgresql.org/docs/current/textsearch.html)
- [Upstash Vector: AI SDK integration](https://upstash.com/docs/vector/integrations/ai-sdk)
- [Upstash Vector: Hybrid Indexes](https://upstash.com/docs/vector/features/hybridindexes)

## Changelog

- **0.1 (2026-02-01)**: Initial draft.
- **0.1.1 (2026-02-03)**: Linked to SPEC-0021 as the cross-cutting finalization spec.
