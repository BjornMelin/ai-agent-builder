---
spec: SPEC-0004
title: Chat + retrieval augmentation
version: 0.3.0
date: 2026-02-03
owners: ["Bjorn Melin"]
status: Proposed
related_requirements: ["FR-008", "FR-009", "FR-019", "PR-001", "PR-002"]
related_adrs: ["ADR-0006", "ADR-0004", "ADR-0011"]
notes: "Defines chat UX, persistence, and RAG behavior for grounded responses."
---

## Summary

Defines streaming chat UX, persistence, and retrieval augmentation for grounded responses.

See [SPEC-0021](./SPEC-0021-full-stack-finalization-fluid-compute-neon-upstash-ai-elements.md)
for the cross-cutting “finalization” plan that integrates chat and retrieval
into the workspace UI, caching, and durable orchestration.

See [SPEC-0022](./SPEC-0022-vercel-workflow-durable-runs-and-streaming-contracts.md)
for the canonical streaming + resumption API contracts and Workflow DevKit integration.

See [SPEC-0023](./SPEC-0023-ai-elements-workspace-ui-and-interaction-model.md)
for the AI Elements-based workspace UI interaction model.

## Context

Users iterate on specs and artifacts via chat. Chat must stream, persist, and use RAG to ground answers in uploads and generated artifacts.

## Goals / Non-goals

### Goals

- Streaming chat with agent modes
- Persistent threads/messages in DB
- RAG grounding with citations
- Low-latency retrieval and caching

### Non-goals

- Realtime multi-user collaboration

## Requirements

Requirement IDs are defined in [docs/specs/requirements.md](/docs/specs/requirements.md).

### Functional requirements

- **FR-008:** Project-scoped chat with streaming responses.
- **FR-009:** Agent mode selection per chat (Orchestrator, Market Research,
  Architect, etc.).
- **FR-019:** Maintain project knowledge base from uploads + generated artifacts
  (retrievable).

### Non-functional requirements

- **NFR-004 (Observability):** Persist logs, latency, token usage, tool calls,
  and errors.
- **NFR-006 (Cost controls):** Caching and guardrails limit web calls and token
  usage.

### Performance / Reliability requirements (if applicable)

- **PR-001:** Streaming begins within 1.5s (p95) for warm paths.
- **PR-002:** Retrieval top-k query within 250ms (p95) for warm paths.

### Integration requirements (if applicable)

- **IR-005:** Vector search via Upstash Vector (prefer HYBRID indexes when
  provisioning).
- **IR-001:** All model/embedding calls through Vercel AI Gateway.

## Constraints

- Every non-trivial factual claim must have a citation
- Tool usage must be server-side only

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.3 | 3.25 |
| Application value | 0.30 | 9.4 | 2.82 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.2 | 0.92 |

**Total:** 9.24 / 10.0

## Design

### Architecture overview

- Chat Route Handler streams agent output via AI SDK.
- Retrieval tool queries Upstash Vector (chunks + artifacts).
- Citations are rendered as footnotes.

### Data contracts (if applicable)

- Chat message persistence: see [docs/architecture/data-model.md](/docs/architecture/data-model.md).
- Retrieval results include enough metadata to render citations:
  - `url` (for web sources)
  - `fileId`/`chunkId` (for uploaded and generated sources)

### File-level contracts

- `src/app/(app)/projects/[projectId]/chat/page.tsx`: UI for streaming chat and message history.
- `src/app/api/chat/route.ts`: server streaming endpoint; must persist messages/tool calls.
- `src/lib/ai/tools/retrieval.server.ts`: retrieval tools (uploads + artifacts);
  must enforce project scoping and top-k bounds.
- `src/lib/upstash/vector.server.ts`: vector query interface with metadata filters.

### Configuration

- See [docs/ops/env.md](/docs/ops/env.md):
  - AI Gateway: `AI_GATEWAY_API_KEY` (optional `AI_GATEWAY_BASE_URL`)
  - Upstash Vector: `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`
  - Optional caching: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## Acceptance criteria

- Chat streams responses and persists message history
- RAG tool returns cited sources for grounded answers
- Agent modes can be switched per message

## Testing

- Unit: retrieval tool ranking and filtering
- Integration: chat route streams and writes to DB

## Operational notes

- Cache retrieval results in Redis for hot queries

## Failure modes and mitigation

- Vector query failure → fall back to DB-only context with warning

## Key files

- `src/app/api/chat/route.ts`
- `src/lib/ai/tools/retrieval.server.ts`

## References

- [ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
- **0.3 (2026-02-03)**: Updated file path references to server-only modules.
