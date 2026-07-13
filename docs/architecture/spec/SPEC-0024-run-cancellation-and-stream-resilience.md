---
spec: SPEC-0024
title: Run cancellation + stream resilience hardening
version: 0.7.0
date: 2026-07-13
owners: ["Bjorn Melin"]
status: Implemented
related_requirements:
  ["FR-010", "FR-011", "FR-023", "PR-004", "PR-005", "NFR-004", "NFR-015"]
related_adrs: ["ADR-0026", "ADR-0011", "ADR-0014"]
related_specs:
  ["SPEC-0005", "SPEC-0009", "SPEC-0021", "SPEC-0022", "SPEC-0023"]
notes: "Bugfix-driven spec: preserve canonical terminal status, resumable client identity, and usable streams across cancellation and transport failures."
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
  - Next.js App Router patterns only.
  - Memoization follows `$vercel-react-best-practices`: use `useMemo`/`useCallback` only for genuinely expensive work or to prevent costly re-renders (`rerender-memo`), and avoid memo for cheap primitives (`rerender-simple-expression-in-memo`).
  - Strict TypeScript (no `any`).
  - TSDoc for exported APIs.

## Non-goals

- Redesign the durable runs architecture (covered by SPEC-0005 / SPEC-0016).
- Change the `run_status` enum or add an intermediate status. The durable fence
  uses a nullable timestamp.

## Problem Statement

### Misclassification of cancellations

The durable run workflow catch-all error handler must not persist cancellations
as failures. Workflow DevKit cancellations raise a specific cancellation error
type (`WorkflowRunCancelledError`) which must be treated as user-initiated
`canceled` runs.

Additionally, cancellation persistence must avoid terminal-status races that can
block persisting `canceled` when a run is marked terminal prematurely.

Cancellation must also close sandbox provisioning races. A run can own active
or shared sandboxes even when individual sandbox jobs are terminal.

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
- Once `cancel_requested_at` is committed, later running, waiting, blocked,
  succeeded, or failed writes MUST be database no-ops.

### Durable cancellation fence

`runs.cancel_requested_at` separates cancellation intent from terminal
completion. The run keeps its current status while external cleanup is pending.

The canonical server sequence is:

1. Authenticate access to the run.
2. Persist `cancel_requested_at`.
3. Request Workflow DevKit cancellation.
4. Stop and confirm every run-owned sandbox.
5. Persist the run and its non-terminal steps as `canceled`.

Sandbox job creation locks and checks the run row in its insert transaction.
This lock serializes job creation with the fence update and prevents provisioning
after cancellation starts.

Failed workflow or sandbox cancellation leaves the fence and retryable cleanup
state intact. The server MUST NOT persist the parent run as `canceled` until all
required external cleanup succeeds.

After fencing, cancellation bypasses request memoization to reread the
authoritative Workflow ID before issuing external cancellation. A terminal
`canceled` retry also reissues cancellation for its known Workflow ID,
preventing a stale pre-fence read from orphaning an execution.

An expiring `sandbox_stop_claimed_at` lease serializes each provider stop. A
concurrent caller reports cleanup as pending instead of issuing a duplicate
stop. Failed attempts release the lease, and abandoned claims expire. Lease
freshness uses the database clock.

Every provisioning Workflow step passes its stable native step ID as
`sandbox_jobs.provisioning_key`; `(run_id, provisioning_key)` is unique. The
runner reuses a published resource across retries. If creation is aborted or
its response is lost before `sandbox_id` is published, the durable
`provisioning_expires_at` window blocks replacement for the create deadline plus
the configured provider TTL. While that window is live, the runner raises the
Workflow runtime's native retryable error with `retryAfter` set to the persisted
expiry. Cancellation remains pending only through that finite window; a retry
after expiry terminalizes the no-ID job without provider I/O. A `canceling` job
whose sandbox already has a durable stop confirmation terminalizes immediately.

Migration `0010` installs a database lifecycle trigger before its one-shot
backfill. Pinned old Workflow deployments therefore cannot insert jobs after a
run fence, overwrite cancellation or terminal state, or leave late metadata
`sandboxId` values outside first-class ownership; no-ID legacy writes receive a
conservative finite expiry.

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

Code Mode also classifies `AppError` code `sandbox_job_canceled` as
cancellation. The sandbox runner emits this error when a durable cancellation
claim wins startup or finalization.

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

### Code Mode terminal ownership

The outer Code Mode workflow owns terminal stream events. The sandbox session
step emits progress and returns finalized job outputs, but it never emits a
terminal event.

On success, the outer workflow uses this order:

1. Finalize the sandbox session.
2. Persist the summary artifact and successful artifact step.
3. Persist the run as `succeeded`.
4. Emit `terminal` with `status: "succeeded"`.

Failure and cancellation catches persist and read back the authoritative
terminal state before emitting `terminal`. If persistence cannot be confirmed,
the workflow emits no terminal event. Stream write and close failures remain
best-effort after terminal persistence.

All exceptions after sandbox provisioning enter the session finalizer. This
includes status writes, tool setup, model setup, agent construction, and stream
execution.

The finalizer MUST NOT return a successful job when cancellation owns the
durable job row. It stops the provisioned sandbox, confirms cleanup, and throws
`sandbox_job_canceled` for the outer workflow to classify.

Successful sandbox finalization also uses the canonical leased stop operation.
Lookup, blocking stop, provider confirmation, and `sandbox_stopped_at`
persistence share one deadline, and successful job status is written only after
that operation completes. An activation write failure must publish the known
resource identity or directly stop the returned Sandbox object; cleanup failure
leaves the job non-terminal for TTL-safe reconciliation.

Implementation checkout failures stop the newly provisioned sandbox before
persisting job failure. The parent records that sandbox identity before outer
step persistence or stream emission, and its catch refuses to persist failed or
canceled terminal state while cleanup remains unconfirmed.

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
- Auto-reconnect budget:
  - 3 consecutive attempts
  - backoff intervals: 250 ms, 750 ms, 1,500 ms

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

## Code Mode stream UI contract

Code Mode uses its structured `terminal` event as the only completion signal.
The `[DONE]` transport marker or a closed reader without `terminal` marks an
interruption and starts the reconnect budget.

Before the start request, the client stores a validated, versioned identity with
`{ projectId, runId, workflowRunId: null, prompt, network }`. The client-created
UUID is both the canonical app run ID and the request idempotency key. After the
server or authenticated discovery supplies the canonical Workflow ID, the client
updates the same identity, resumes from the stored `startIndex`, and clears both
values only after a structured terminal event or authenticated persisted-terminal
reconciliation. The stream route exposes persisted status in
`x-code-mode-run-status` for this fallback.

`GET /api/code-mode` discovers a known run ID or the authenticated user's active
run for a project. A missing or ambiguous start response therefore cannot orphan
the only client handle. The server serializes canonical run insertion under the
project row lock and validates project, owner, and immutable start input before
reusing an ID.

Workflow `start()` generates its own ID and may accept a queue message before the
HTTP caller receives that ID. Each Code Mode envelope therefore performs an
atomic first-step registration with `getWorkflowMetadata().workflowRunId`. Only
the registered winner continues; concurrent or ambiguous-retry envelopes exit
before stream writes, state transitions, sandbox provisioning, or artifacts.

An active identity locks new starts and keeps cancellation available after a
transport interruption, preventing a second run from replacing the only local
handle to an in-flight sandbox.

The client keeps its reader connected while it requests cancellation. If the
server rejects cancellation, the client shows the error, restores the cancel
action, and continues reading the active stream. If cancellation succeeds, the
client immediately opens a fresh authenticated stream so the persisted terminal
status is reconciled even after the earlier reconnect budget was exhausted.

## Testing Requirements (Vitest)

### Unit tests

- Cancellation detection helper:
  - true for `WorkflowRunCancelledError`
  - true for `AppError` code `sandbox_job_canceled`
  - false for generic errors and non-object values
- Run cancellation persistence:
  - persists the fence before workflow cancellation and sandbox cleanup
  - rejects terminal completion when the fence is absent
  - prevents terminal status writes after the fence
- Sandbox ownership:
  - rejects job creation after the fence
  - preserves `canceling` while activation publishes a sandbox ID
  - stops IDs referenced by terminal jobs
  - persists partial stop successes
  - leaves claimed no-ID jobs retryable
  - completes expired no-ID jobs using the database clock
  - reuses one job for a stable Workflow provisioning key
  - schedules a live unknown-create retry at its persisted expiry
  - directly stops a known resource when activation publication fails
  - completes cancellation immediately for already-confirmed stops
  - treats terminal and missing sandboxes as confirmed cleanup
  - bounds lookup, blocking stop, and confirmation with one abort deadline
  - prevents duplicate provider stops across concurrent cancellation requests

### Component tests (jsdom)

Run stream client behavior:

1. Stream ends without `[DONE]`
   - transitions away from `streaming`
   - shows interruption warning
2. Auto-reconnect path
   - first stream ends without `[DONE]`
   - second stream returns `[DONE]`
   - ends in `done` without interruption warning

Code Mode client and workflow behavior:

1. Artifact creation and terminal database persistence precede terminal success.
2. Failure and cancellation emit their matching structured terminal status.
3. Setup failure after sandbox provisioning still finalizes the sandbox once.
4. Refresh restores active identity and reconnects from the persisted cursor.
5. Transport closure without `terminal` retains active identity.
6. Rejected cancellation leaves the reader connected and the cancel action usable.
7. A terminal persisted status closes a stream that lacks a terminal event.
8. An interrupted active run cannot be replaced by a new start.
9. Persistence failure emits no unconfirmed terminal event.
10. An accepted cancellation reconciles terminal state after automatic stream
    retries are exhausted.
11. A persisted cancellation fence prevents Code Mode sandbox provisioning and
    follows the canonical canceled workflow path.
12. Two same-tick start submissions send one POST and persist the run UUID before
    that POST begins.
13. A lost start response or reload recovers the client-known run through the
    authenticated discovery route.
14. Concurrent Workflow envelopes register one winner; every loser exits before
    sandbox provisioning.
15. Workflow retries use the stable native step ID for sandbox provisioning and
    reuse one Code Mode summary artifact/indexing key.

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

## Changelog

- **0.3 (2026-07-13)**: Added Code Mode terminal ownership, resumable client identity, and persisted-terminal reconciliation.
- **0.4 (2026-07-13)**: Added the durable run fence, sandbox resource drain ordering, expiring stop leases, race-safe job activation, and finalizer cancellation precedence.
- **0.5 (2026-07-13)**: Added stable Workflow provisioning identity, database-clock provider TTL windows, activation-failure cleanup, and stop-confirmed successful finalization.
- **0.6 (2026-07-13)**: Added client-known Code Mode start identity,
  authenticated active-run discovery, and first-step Workflow ownership claims.
- **0.7 (2026-07-13)**: Added expiry-scheduled unknown-create retries, immediate cancellation for confirmed stops, cleanup-first failure handling, authoritative post-fence Workflow ownership, and rolling-deployment write protection.
