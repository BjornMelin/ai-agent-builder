---
spec: SPEC-0007
title: Web research + citations framework
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["FR-012", "NFR-004", "NFR-006", "PR-001", "IR-007"]
related_adrs: ["ADR-0008", "ADR-0013"]
notes: "Defines web research tool usage, caching, and citation requirements."
---

## Summary

Defines how web research is performed and how citations are recorded and rendered.

## Context

Market research must be current and auditable. Exa search results and Firecrawl extractions must be cached and converted into a minimal citation schema.

## Goals / Non-goals

### Goals

- Reliable search + extraction
- Cache web results to reduce cost
- Normalize citations for rendering in UI and export

### Non-goals

- Storing full copyrighted articles verbatim

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-012**

### Non-functional requirements

- **NFR-004**
- **NFR-006**

### Performance / Reliability requirements (if applicable)

- **PR-001**

### Integration requirements (if applicable)

- **IR-007**

## Constraints

- Respect provider terms and robots
- Enforce per-step URL limits

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.2 | 3.22 |
| Application value | 0.30 | 9.4 | 2.82 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.20 / 10.0

## Design

### Architecture overview

- Exa search provides candidate URLs.
- Firecrawl extracts clean content.
- Redis caches extraction results.
- Citations persisted in Neon and referenced by artifacts.

### Data contracts

- `Citation`: `{url, title, publishedAt?, accessedAt, excerpt}`

### Key files

- `src/lib/ai/tools/web-search.ts`
- `src/lib/ai/tools/firecrawl.ts`
- `src/lib/citations/normalize.ts`

## Acceptance criteria

- Every research section lists citations
- Cache reduces repeat extractions for same URL

## Testing

- Contract: citation normalization stable
- Integration: cache hit avoids second extraction call

## Operational notes

- Set TTLs and cache versioning for extraction profiles

## Failure modes and mitigation

- Extraction fails → retry and/or fall back to summarizing snippet

## References

- [Exa tool](https://ai-sdk.dev/tools-registry/exa)
- [Firecrawl tool](https://ai-sdk.dev/tools-registry/firecrawl)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
