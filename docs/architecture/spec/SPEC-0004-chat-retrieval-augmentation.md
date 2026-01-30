---
spec: SPEC-0004
title: Chat + retrieval augmentation
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["FR-008", "FR-009", "FR-019", "PR-001", "PR-002"]
related_adrs: ["ADR-0006", "ADR-0004", "ADR-0011"]
notes: "Defines chat UX, persistence, and RAG behavior for grounded responses."
---

## Summary

Defines streaming chat UX, persistence, and retrieval augmentation for grounded responses.

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

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-008**
- **FR-009**
- **FR-019**

### Non-functional requirements

- **NFR-004**
- **NFR-006**

### Performance / Reliability requirements (if applicable)

- **PR-001**
- **PR-002**

### Integration requirements (if applicable)

- **IR-005**
- **IR-001**

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

### File-level contracts

- `src/app/(app)/projects/[projectId]/chat/page.tsx`
- `src/app/api/chat/route.ts`
- `src/lib/ai/tools/retrieval.ts`
- `src/lib/upstash/vector.ts`

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
- `src/lib/ai/tools/retrieval.ts`

## References

- [ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
