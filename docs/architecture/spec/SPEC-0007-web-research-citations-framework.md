---
spec: SPEC-0007
title: Web research + citations framework
version: 0.4.0
date: 2026-02-07
owners: ["Bjorn Melin"]
status: Implemented
related_requirements: ["FR-012", "NFR-004", "NFR-006", "PR-001", "IR-007"]
related_adrs: ["ADR-0008", "ADR-0013"]
notes: "Defines web research tool usage, caching, and citation requirements."
---

## Summary

Defines how web research is performed and how citations are recorded and rendered.

## Context

Market research must be current and auditable. Exa search results and Firecrawl
extractions must be cached and converted into a minimal citation schema.[^exa-search][^firecrawl-node]

## Goals / Non-goals

### Goals

- Reliable search + extraction
- Cache web results to reduce cost
- Normalize citations for rendering in UI and export

### Non-goals

- Storing full copyrighted articles verbatim

## Requirements

Requirement IDs are defined in [docs/specs/requirements.md](/docs/specs/requirements.md).

### Functional requirements

- **FR-012:** Web research with citations (search + extraction).

### Non-functional requirements

- **NFR-004 (Observability):** Persist logs, latency, token usage, tool calls,
  and errors.
- **NFR-006 (Cost controls):** Caching and guardrails limit web calls and token
  usage.

### Performance / Reliability requirements (if applicable)

- **PR-001:** Streaming begins within 1.5s (p95) for warm paths.

### Integration requirements (if applicable)

- **IR-007:** Web research via Exa + Firecrawl.

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

- Exa search provides candidate URLs (REST wrapper with deterministic AbortController timeouts).[^exa-search]
- Firecrawl extracts clean content (markdown-first).[^firecrawl-node]
- Redis caches extraction results [Upstash Redis REST API](https://upstash.com/docs/redis/restapi).
- Citations persisted in Neon and referenced by artifacts
  [Neon connection guide](https://neon.com/docs/connect/connect-from-any-app).
- Outbound extraction URLs are validated with SSRF guardrails (deterministic, no DNS resolution).[^owasp-ssrf]

### Data contracts

- `Citation` (minimal, auditable): `{url, title, publishedAt?, accessedAt, excerpt}`
- Research report artifacts reference citations using `citation:n` links.

### File-level contracts

- `src/lib/ai/tools/web-search.server.ts`: Exa search wrapper; enforces query/result bounds and caches results.
- `src/lib/ai/tools/web-extract.server.ts`: Firecrawl extraction wrapper; truncates + caches extracted markdown.
- `src/lib/net/fetch-with-timeout.server.ts`: shared AbortController timeout helper for upstream requests.
- `src/lib/security/url-safety.server.ts`: SSRF defense-in-depth URL validation for outbound extraction.
- `src/lib/citations/normalize.server.ts`: canonical citation schema normalization.
- `src/lib/research/research-report.server.ts`: builds research report artifacts and persists citations linked to the artifact version.
- `src/app/(app)/projects/[projectId]/artifacts/[artifactId]/artifact-markdown-with-citations.tsx`: renders citation links in artifact markdown.

### Configuration

- See [docs/ops/env.md](/docs/ops/env.md):
  - Web research: `EXA_API_KEY`, `FIRECRAWL_API_KEY`
  - Optional caching: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## Acceptance criteria

- Every research report section lists citations
- Cache reduces repeat searches/extractions for identical inputs

## Testing

- Contract: citation normalization stable
- Integration: cache hit avoids second extraction call

## Operational notes

- Set TTLs and cache versioning for extraction profiles

## Failure modes and mitigation

- Extraction fails → retry and/or fall back to summarizing snippet

## References

- [Exa Search API](https://docs.exa.ai/reference/search)
- [Firecrawl Node SDK](https://docs.firecrawl.dev/sdks/node)
- [Upstash Redis REST API](https://upstash.com/docs/redis/restapi)
- [Neon connection guide](https://neon.com/docs/connect/connect-from-any-app)
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).

[^exa-search]: https://docs.exa.ai/reference/search
[^firecrawl-node]: https://docs.firecrawl.dev/sdks/node
[^owasp-ssrf]: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
