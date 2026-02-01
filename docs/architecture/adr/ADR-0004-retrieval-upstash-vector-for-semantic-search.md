---
ADR: 0004
Title: Retrieval: Upstash Vector for semantic + hybrid search
Status: Accepted
Version: 0.3
Date: 2026-02-01
Supersedes: []
Superseded-by: []
Related: [ADR-0003, ADR-0006, ADR-0024]
Tags: [retrieval, architecture]
References:
  - [Upstash Vector + AI SDK](https://upstash.com/docs/vector/integrations/ai-sdk)
  - [Upstash Vector API — Get started](https://upstash.com/docs/vector/api/get-started)
  - [Upstash Vector: Hybrid indexes](https://upstash.com/docs/vector/features/hybridindexes)
---

## Status

Accepted — 2026-01-30.  
Updated — 2026-02-01 (hybrid retrieval guidance).

## Description

Use Upstash Vector for retrieval across:

- uploaded inputs (docs/decks/spreadsheets)
- generated artifacts (PRD/ADRs/SPECs)
- connected target repositories (source code), for implementation runs

Prefer **HYBRID** vector indexes (dense + lexical) when provisioning new indexes
to improve exact-token recall (important for code and identifiers), while still
retaining semantic retrieval quality.

## Context

System quality depends on grounding responses in uploaded sources, previously
generated artifacts, and (for implementation runs) the target repo’s code.

A dedicated vector store with metadata filters and namespaces provides fast
retrieval without complex DB tuning.

Hybrid retrieval improves matches for:

- exact identifiers, file names, function names
- error messages, stack traces
- product names and competitor strings
- “known phrase” lookups where lexical matching matters

## Decision Drivers

- RAG quality (semantic + lexical recall)
- Low ops serverless vector store
- Metadata filtering and namespaces
- AI SDK ecosystem alignment
- Ability to scale indexing for both docs and code

## Alternatives

- A: Upstash Vector (DENSE or HYBRID)
  - Pros: serverless; AI SDK integration.
  - Cons: external dependency.
- B: Neon + pgvector
  - Pros: single DB.
  - Cons: more tuning and scaling concerns; hybrid lexical search requires extra machinery.
- C: Dedicated vector DB (Pinecone/Weaviate/etc.)
  - Pros: powerful features.
  - Cons: cost + ops overhead; ecosystem drift.

### Decision Framework

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.3 | 3.25 |
| Application value | 0.30 | 9.5 | 2.85 |
| Maintenance & cognitive load | 0.25 | 9.1 | 2.27 |
| Architectural adaptability | 0.10 | 9.2 | 0.92 |

**Total:** 9.30 / 10.0

## Decision

We will adopt **Upstash Vector** as the system vector store.

- When creating new indexes, prefer HYBRID indexes when supported by the plan.
- Use namespaces per project and per target repo to isolate retrieval scope.

## Constraints

- Maintain deletion hygiene (remove vector entries on project delete).
- Keep namespaces stable.
- Store canonical text in DB for audit/export.

## High-Level Architecture

```mermaid
flowchart LR
  Ingest[Chunk + Embed] --> VECTOR[(Upstash Vector)]
  Chat[Chat/Agents] --> VECTOR
  Chat --> DB[(Neon)]
```

## Related Requirements

### Functional Requirements

- **FR-007:** Embed and index chunks.
- **FR-019:** Retrieval knowledge base.

### Non-Functional Requirements

- **NFR-006:** Cost controls via bounded top-k and caching.

### Performance Requirements

- **PR-002:** Retrieval latency p95 <= 250ms (warm).

### Integration Requirements

- **IR-005:** Upstash Vector required (HYBRID preferred when provisioning).

## Design

### Architecture Overview

Planned implementation module:

- `src/lib/upstash/vector.ts`: client + helper functions (namespace, upsert,
  query, delete).

### Implementation Details

- Deterministic vector IDs for idempotency: `{{fileId}}:{{chunkIndex}}`.
- Metadata filters: `projectId`, `fileId`, `type`.
- Keep top-k small and rerank in-model if needed.

## Testing

- Integration: upsert then query returns expected items.
- Regression: delete project removes namespace entries.
- Performance: measure p95 retrieval under warm cache.

## Implementation Notes

- Store content hashes to avoid redundant embedding computation.
- Prefer async embedding with QStash for large files.

## Consequences

### Positive Outcomes

- Fast RAG retrieval
- Low operational overhead
- Scales with usage

### Negative Consequences / Trade-offs

- Additional vendor dependency

### Ongoing Maintenance & Considerations

- Monitor index size and implement retention policies
- Review embedding model changes for re-index triggers

### Dependencies

- **Added**: @upstash/vector
- **Removed**: []

## Changelog

- **0.1 (2026-01-29)**: Initial version.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
- **0.3 (2026-02-01)**: Updated for hybrid retrieval guidance.
