---
spec: SPEC-0005
title: Durable runs & orchestration
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["FR-010", "FR-011", "PR-004", "PR-005", "IR-004"]
related_adrs: ["ADR-0005"]
notes: "Defines durable run execution, step graph, retries, and QStash integration."
---

## Summary

Defines how durable run pipelines execute step-by-step with retries and idempotency.

## Context

Long-running research/spec pipelines must run reliably even when the user disconnects. We use QStash to enqueue and retry step execution via signed HTTP requests.

## Goals / Non-goals

### Goals

- Durable run state persisted in DB
- Step graph explicit and versioned
- Idempotent step execution
- Retries and failure visibility in UI

### Non-goals

- General-purpose workflow engine beyond this app

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-010**
- **FR-011**

### Non-functional requirements

- **NFR-004**
- **NFR-005**

### Performance / Reliability requirements (if applicable)

- **PR-004**
- **PR-005**

### Integration requirements (if applicable)

- **IR-004**

## Constraints

- QStash signature verification mandatory
- Steps must not depend on client state

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

- Run creation writes DB record then publishes QStash message.
- Step handler verifies signature, executes step, writes outputs.
- Retry policy is controlled by QStash and step idempotency.

### Configuration

- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`

### File-level contracts

- `src/app/api/runs/route.ts`
- `src/app/api/jobs/run-step/route.ts`
- `src/lib/runs/steps/*`

## Acceptance criteria

- A run can complete without an active client connection
- Replaying a step does not duplicate artifacts
- Failed steps are visible and retryable

## Testing

- Integration: enqueue and execute a single step locally (mock QStash)
- Contract: unsigned step requests rejected

## Operational notes

- Persist run timeline and tool usage for debugging

## Failure modes and mitigation

- Step throws → persist error, mark failed, allow retry
- Signature verification fails → reject request with 401

## Key files

- `src/app/api/jobs/run-step/route.ts`
- `src/lib/runs/steps`

## References

- [QStash Next.js](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
