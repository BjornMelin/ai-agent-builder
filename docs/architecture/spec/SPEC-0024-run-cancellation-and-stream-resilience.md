---
spec: SPEC-0024
title: Run cancellation + stream resilience hardening
version: 0.1.1
date: 2026-02-05
owners: ["Bjorn Melin"]
status: Implemented
related_requirements:
  ["FR-010", "FR-011", "FR-023", "PR-004", "PR-005", "NFR-004", "NFR-015"]
related_adrs: ["ADR-0026", "ADR-0011", "ADR-0014"]
related_specs: ["SPEC-0005", "SPEC-0021", "SPEC-0022", "SPEC-0023"]
notes: "Bugfix-driven spec: ensure workflow cancellations persist/emit as canceled (not failed) and the runs stream UI never remains stuck in streaming when the SSE stream ends unexpectedly."
---

## Summary

This spec resolves two correctness issues discovered in review:

1. **Cancellation correctness:** Workflow DevKit cancellations MUST persist and
   emit as `canceled`, not `failed`.
2. **Stream UI resilience:** The runs stream UI MUST transition out of
   `streaming` when the SSE stream ends unexpectedly (without a finish
   sentinel) and MUST support resumable reconnect using `startIndex`.

This spec is an implementation-level addendum aligned with:

- [SPEC-0005](./SPEC-0005-durable-runs-orchestration.md) (run state machine + persistence)
- [SPEC-0022](./SPEC-0022-vercel-workflow-durable-runs-and-streaming-contracts.md) (Workflow DevKit substrate + resumable streams)
- [SPEC-0023](./SPEC-0023-ai-elements-workspace-ui-and-interaction-model.md) (AI Elements UI/UX expectations)
- [SPEC-0021](./SPEC-0021-full-stack-finalization-fluid-compute-neon-upstash-ai-elements.md) (implemented endpoints inventory)

## Goals

- Persist cancellations as `canceled` reliably (no terminal-status race causing a
  permanent `failed`).
- Ensure cancel updates also cancel **non-terminal steps** (idempotent,
  concurrency-safe).
- Ensure run stream UI never gets stuck in `streaming` when the stream ends
  without a finish sentinel.
- Ensure reconnect/resume works using `startIndex` without duplicated events.
- Enforce repo constraints:
  - Next.js App Router patterns only
  - No manual memoization (`useMemo`, `useCallback`)
  - Strict TypeScript (no `any`)
  - TSDoc for exported APIs

## Non-goals

- Redesign the durable runs architecture (covered by SPEC-0005 / SPEC-0016).
- Change DB schema (no enum/status changes).

## Problem Statement

### Misclassification of cancellations

The durable run workflow catch-all error handler must not persist cancellations
as failures. Workflow DevKit cancellations raise a specific cancellation error
type (`WorkflowRunCancelledError`) which must be treated as user-initiated
`canceled` runs.

Additionally, cancellation persistence must avoid terminal-status races that can
block persisting `canceled` when a run is marked terminal prematurely.

### Stream UI stuck in `streaming`

The runs stream client must not rely exclusively on an explicit finish sentinel
(`data: [DONE]`). If the SSE connection ends without the sentinel, the UI must
stop showing `streaming` and provide an interruption state and reconnect option.

## Canonical Contracts

### Terminal statuses

Terminal run and step statuses:

- `succeeded`
- `failed`
- `canceled`

### Terminal precedence / overwrite rules

- `failed` and `succeeded` MUST NOT be overwritten by `canceled`.
- `canceled` may be written when the run is `pending|running|waiting|blocked`.
- Cancellation persistence MUST be idempotent and safe under concurrency.

### Cancel persistence must cancel steps

When canceling a run:

- Run status becomes `canceled` (unless already `succeeded|failed`).
- All steps that are not terminal MUST transition to `canceled` and record an
  `endedAt` timestamp.

### Cancellation must win step persistence races

Cancellation is a first-class terminal state for steps. Persistence helpers that
transition step state (for example: `beginRunStep` and `finishRunStep`) MUST NOT:

- restart a step once it is `canceled`
- overwrite a `canceled` step to `succeeded|failed`

This MUST be enforced at the database update layer using `WHERE` predicates
(not just in application logic) to remain safe under concurrency.

## Workflow Cancellation Handling

### Detect cancellation reliably

Workflow catch blocks MUST classify cancellation using the Workflow DevKit
cancellation error type:

- `WorkflowRunCancelledError` (available via `workflow/internal/errors`)

Detection should use the type guard (`WorkflowRunCancelledError.is(error)`) to
avoid `instanceof` issues across module boundaries.

### Workflow catch-all behavior

In the durable run orchestrator:

- On success:
  - persist `succeeded`
  - emit `run-finished` with `status: "succeeded"`
- On failure:
  - if cancellation:
    - persist cancellation using the canonical “cancel run + steps” operation
    - emit `run-finished` with `status: "canceled"`
    - rethrow the original error (cancellation is still observed by the runtime)
  - else:
    - persist `failed`
    - emit `run-finished` with `status: "failed"`
    - rethrow the original error
- Stream closure:
  - attempt close in `finally`
  - close failures are best-effort and MUST NOT change terminal persistence

## Runs Stream UI Contract (Client)

### State machine

Client stream UI uses:

- `idle`
- `streaming`
- `done`
- `error`

And tracks:

- `wasInterrupted: boolean` (true if the stream ends without an explicit finish
  sentinel)

Rules:

- Receiving `[DONE]` => `status = done`, `wasInterrupted = false`.
- Reader returns `done: true` without `[DONE]` and without abort =>
  `status = done`, `wasInterrupted = true`.
- Exception while reading (not aborted) => `status = error`,
  `wasInterrupted = true`.

### Reconnect/resume

The client MUST persist a monotonic `startIndex` cursor (session-scoped).

- Endpoint: `GET /api/runs/:runId/stream?startIndex=N`
- `startIndex` is the number of chunks already processed on the client.
- Auto reconnect budget:
  - 3 consecutive attempts
  - backoff: 250ms, 750ms, 1500ms

If budget is exhausted, the UI remains `done` with `wasInterrupted = true` and
offers a manual “Reconnect” action.

### UI requirements (AI Elements)

Runs stream rendering MUST use AI Elements primitives:

- `Conversation`, `ConversationContent`, `ConversationEmptyState`,
  `ConversationScrollButton`
- `Message`, `MessageContent`, `MessageResponse`

The header MUST:

- show the current status (`streaming|done|error`)
- show interruption warning when `wasInterrupted = true`
- offer “Reconnect” when interrupted and not streaming

## Testing Requirements (Vitest)

### Unit tests

- Cancellation detection helper:
  - true for `WorkflowRunCancelledError`
  - false for generic errors and non-object values

### Component tests (jsdom)

Run stream client behavior:

1. Stream ends without `[DONE]`
   - transitions away from `streaming`
   - shows interruption warning
2. Auto-reconnect path
   - first stream ends without `[DONE]`
   - second stream returns `[DONE]`
   - ends in `done` without interruption warning

Constraints:

- deterministic streams (no real network)
- deterministic time (fake timers for backoff)
- mocks restored per test file (repo default)

## Verification Commands

- `bun run format`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
