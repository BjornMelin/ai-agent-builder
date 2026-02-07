---
ADR: 0008
Title: Web research: Exa + Firecrawl with citations
Status: Implemented
Version: 0.4
Date: 2026-02-07
Supersedes: []
Superseded-by: []
Related: [ADR-0006, ADR-0013]
Tags: [research, architecture]
References:
  - [Exa Search API](https://docs.exa.ai/reference/search)
  - [Firecrawl Node SDK](https://docs.firecrawl.dev/sdks/node)
  - [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
---

## Status

Implemented — 2026-02-07.

## Description

Use Exa for search and Firecrawl for page extraction, enforcing citation capture per claim with strict budgets, caching, and SSRF guardrails.

## Context

Market validation and competitive research require up-to-date web information. We need reliable search results plus robust extraction to get clean content for summarization.

## Decision Drivers

- High-quality search
- Reliable extraction
- Citation enforcement
- Low maintenance surface area (thin wrappers + caching)

## Alternatives

- A: Exa + Firecrawl — Pros: purpose-built; thin, typed adapters. Cons: two vendors.
- B: Only search (no extraction) — Pros: simpler. Cons: low quality grounding.
- C: Scrape manually — Pros: control. Cons: high maintenance and fragility.

### Decision Framework

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.2 | 3.22 |
| Application value | 0.30 | 9.6 | 2.88 |
| Maintenance & cognitive load | 0.25 | 9.1 | 2.27 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.29 / 10.0

## Decision

We will adopt **Exa** for search and **Firecrawl** for content extraction, capturing source URLs and minimal excerpts for citations.

Implementation detail: Exa calls use a small REST wrapper (AbortController + timeouts) rather than the Exa SDK to guarantee deterministic cancellation under load.[^exa-search]

## Constraints

- Respect robots and provider terms.
- Do not store full copyrighted articles; store snippets + summaries.
- Enforce max URLs per step and cache results.
- Enforce SSRF guardrails for outbound extraction URLs.[^owasp-ssrf]
- SSRF validation is defense-in-depth and intentionally does not perform DNS resolution; hostnames that resolve to private IPs or DNS rebinding attacks are out of scope and must be mitigated via provider-side protections and/or egress controls.

## High-Level Architecture

```mermaid
flowchart LR
  Agent --> Exa[Exa search tool]
  Agent --> Firecrawl[Firecrawl extract tool]
  Firecrawl --> Cache[(Upstash Redis cache)]
  Agent --> DB[(Neon citations)]
```

## Related Requirements

### Functional Requirements

- **FR-012:** Web research with citations.

### Non-Functional Requirements

- **NFR-006:** tool-call caps and caching.
- **NFR-004:** persist citations.

### Performance Requirements

- **PR-001:** fast stream start with incremental research.

### Integration Requirements

- **IR-007:** Exa and Firecrawl required.

## Design

### Architecture Overview

- `src/lib/ai/tools/web-search.server.ts` wraps Exa queries.
- `src/lib/ai/tools/web-extract.server.ts` wraps Firecrawl extraction.
- `src/lib/net/fetch-with-timeout.server.ts` enforces AbortController timeouts for upstream requests.
- `src/lib/security/url-safety.server.ts` blocks known-unsafe URLs (SSRF defense-in-depth).
- Cache by `(tool, params)` in Upstash Redis.

### Implementation Details

- Store citations as `{url, title, publishedAt?, accessedAt, excerpt}`.
- Link citations to artifacts (not chat messages) for auditing/export.
- Render citations in artifact markdown via `citation:n` links.

## Testing

- Contract tests: tool returns normalized citation record.
- Integration: cached fetch avoids repeated extraction.
- Regression: tool limits enforced.

## Implementation Notes

- If sources disagree, record both and present uncertainty.

## Consequences

### Positive Outcomes

- High-quality and current research
- Cleaner extracted text
- Less custom scraping code

### Negative Consequences / Trade-offs

- External API costs
- Need careful caching and tool limits

### Ongoing Maintenance & Considerations

- Monitor API quota usage
- Update extraction profiles if HTML changes

### Dependencies

- **Added**: `@mendable/firecrawl-js`

## Changelog

- **0.1 (2026-01-29)**: Initial version.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
- **0.3 (2026-02-07)**: Implemented with server wrappers, caching, budgets, and artifact-linked citations.
- **0.4 (2026-02-07)**: Hardened adapters with deterministic timeouts and SSRF guardrails; removed unused Exa SDK dependency.

[^exa-search]: https://docs.exa.ai/reference/search
[^owasp-ssrf]: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
