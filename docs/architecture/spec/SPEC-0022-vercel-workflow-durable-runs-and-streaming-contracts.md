---
spec: SPEC-0022
title: Durable runs & streaming contracts (Vercel Workflow DevKit)
version: 0.8.0
date: 2026-07-13
owners: ["Bjorn Melin"]
status: Implemented
related_requirements:
  ["FR-008", "FR-010", "FR-011", "FR-023", "FR-031", "IR-001", "IR-004", "NFR-004", "NFR-013", "PR-001", "PR-004", "PR-005"]
related_adrs: ["ADR-0026", "ADR-0006", "ADR-0007", "ADR-0021", "ADR-0014"]
notes: "Defines the canonical Workflow DevKit integration for multi-turn chat and durable runs, including resumable streaming contracts, hook endpoints, and event schemas."
---

## Summary

This spec defines the **canonical** interactive-orchestration implementation for this repo:

- Use **Vercel Workflow DevKit** (`workflow` + `@ai-sdk/workflow`) for:
  - durable interactive runs and multi-turn chat sessions
  - streaming responses that can resume after timeouts/disconnects
  - human-in-the-loop waits/resume
- Use **Upstash QStash** only for **background jobs** (ingestion), per ADR-0005.

This spec is the implementation-level companion to:

- [ADR-0026](../adr/ADR-0026-orchestration-vercel-workflow-devkit-for-interactive-runs.md)
- [SPEC-0021](./SPEC-0021-full-stack-finalization-fluid-compute-neon-upstash-ai-elements.md)

## Implementation status

Implemented in this repo:

- Chat session `WorkflowAgent`, user-message markers, and persist-before-publish assistant turns: `src/workflows/chat/project-chat.workflow.ts`
- Canonical assistant construction and replay-safe publishing: `src/workflows/chat/steps/assistant-turn-stream.step.ts`
- Chat stream reconnect contract (`startIndex`): `src/app/api/chat/[runId]/stream/route.ts`, `src/app/(app)/projects/[projectId]/chat/chat-client.tsx`
- Runs stream reconnect contract (`startIndex`): `src/app/api/runs/[runId]/stream/route.ts`, `src/app/(app)/projects/[projectId]/runs/[runId]/run-stream-client.tsx`
- Code Mode stream reconnect contract (`startIndex`): `src/app/api/code-mode/[runId]/stream/route.ts`, `src/app/(app)/projects/[projectId]/code-mode/code-mode-client.tsx`

## Goals

- Define **decision-complete** API contracts for starting and resuming streams.
- Define a multi-turn **chat session** workflow pattern that:
  - keeps one workflow run open across multiple user turns
  - persists session state inside the workflow
  - writes user-message markers into the stream for correct replay ordering
  - persists each completed assistant turn before any client delivery
- Define the minimal **security** and **idempotency** rules for tool execution and approvals.

## Non-goals

- UI layout and component-level UX details (see SPEC-0023).
- Full implementation run DAG semantics (see SPEC-0005 + SPEC-0016); this spec focuses on the execution substrate and streaming contracts.

## Why Workflow DevKit (Decision)

Workflow DevKit provides first-class patterns for:

- Next.js integration (`withWorkflow`) and proxy handler exclusions for `.well-known/workflow/` ([Workflow DevKit Next.js getting started](https://useworkflow.dev/docs/getting-started/next)).
- Resumable streams with `x-workflow-run-id` and cursor-based reconnect via `startIndex` ([Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams)).
- Multi-turn chat sessions using hooks to inject follow-up messages into a single workflow run ([Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling)).

Upstash Workflow can provide durable execution, but its AI SDK integration guidance centers on wrapping model calls via `context.call` in a custom `fetch` implementation (durability) rather than providing a browser-native streaming/resumption transport ([Upstash Workflow AI SDK integration](https://upstash.com/docs/workflow/integrations/aisdk)).

## Architecture Overview

### Multi-turn chat session (one workflow run)

One workflow run owns session state and keeps a single stream open for the whole conversation:

1. The client creates a stable thread UUID and initial message ID before POSTing
   `/api/chat`. The route commits that immutable start intent before dispatch.
2. The route starts the workflow. The route and the workflow's first step race
   through one compare-and-swap registration; only the canonical Workflow run
   may proceed to any chat side effect.
3. The client injects follow-ups (POST `/api/chat/:runId`) through the reusable
   Workflow hook after authenticated, read-only admission preflight.
4. The client can reconnect at any time
   (GET `/api/chat/:runId/stream?startIndex=`). Deterministic assistant chunk
   identities suppress at-least-once publisher replay without changing the
   native Workflow cursor space.

Reference pattern: “Multi-Turn Workflows” ([Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling)).

## API Contracts (Canonical)

All contracts are validated with Zod v4 on the server.

### 1. Start chat session

`POST /api/chat`

Request body (JSON):

- `projectId`: string (required)
- `threadId`: UUID string (required; generated before the first request)
- `message`: `UIMessage` (required)
  - MUST be exactly one `user` message containing only text/file parts and at
    least one non-blank text or valid file part.
  - Its ID MUST be 1-128 characters and MUST NOT use the server-owned
    `assistant:` namespace or start-intent receipt ID.
  - Initial assistant, system, and history arrays are not accepted.
- `modeId`: string (optional; defaults through the agent-mode registry)

Before dispatch, the route transactionally persists the thread in `pending`
state and its immutable initial user message. Reusing `threadId` with the exact
same validated start payload is idempotent. Reusing it with another project,
mode, title, message identity, or message payload returns
`409 chat_start_conflict`.

Response:

- Status: `200`
- Headers:
  - `x-workflow-run-id`: string (required): identifies the durable run and stream ([Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams))
  - `x-chat-thread-id`: string (required): identifies the chat thread persisted before the response is returned
- Body: an AI SDK UI message event stream (SSE-compatible) that may remain open across turns.

If the response is lost or Workflow dispatch has an ambiguous result, the
client retries with the same `threadId` and message IDs. The route recovers the
canonical registered Workflow run instead of starting a second logical chat.

### 2. Send follow-up message (resume hook)

`POST /api/chat/:runId`

Request body (JSON):

- `messageId`: string (required)
- `message`: string (optional)
- `files`: `FileUIPart[]` (optional)

Validation:

- At least one of `message` or `files` MUST be provided.
- `messageId` MUST be at most 128 characters and MUST NOT use the server-owned `assistant:` namespace.
- Attachment URLs and media types MUST pass the project-scoped upload checks.

Response:

- Queued delivery: status `202`, body `{ "ok": true, "status": "queued" }`
- Exact committed retry: status `200`, body
  `{ "ok": true, "status": "duplicate" }`

An exact retry of a committed `messageId` returns `duplicate`. Reusing the same
ID with another payload returns `409 chat_message_id_conflict`. A non-waiting
active session returns `409 chat_session_busy`; a terminal session returns
`409 chat_session_terminal`. A waiting row whose reusable hook is not registered
returns `409 chat_hook_unavailable`. These conflicts do not invalidate the
client's active run identity.

The route supplies the persisted waiting generation to the internal hook
payload. It does not reserve a database row or roll back on `resume()` errors.
A `queued` response confirms only durable hook enqueueing. The client retains
the draft until a matching user marker confirms workflow admission. A rejected
workflow disposition keeps the draft available for retry. If delivery returns
an ambiguous error, clients retry the same payload with the same `messageId`;
the durable hook event and workflow consumer provide idempotency.

### 3. Read authoritative lifecycle

`GET /api/chat/:runId`

Response:

- Status: `200`
- Body:
  `{ "status": ChatThreadStatus, "threadId": string, "workflowRunId": string }`

The endpoint applies the same user/project authorization as stream and
follow-up routes. Clients use it to reconcile a generic stream close or
transport error; stream EOF alone is never interpreted as success.

### 4. Reconnect to stream (resume)

`GET /api/chat/:runId/stream?startIndex=N`

Query params:

- `startIndex`: integer (optional): the client’s last received chunk index

Response:

- Status: `200`
- Header `x-chat-thread-status`: authoritative persisted lifecycle status.
- Body: AI SDK UI message event stream that resumes from `startIndex`
  ([Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams)).

For a terminal thread, native chunks remain authoritative until the requested
cursor passes the native stream tail. A request after that tail receives a
synthetic terminal marker and final `finish`, allowing clients whose stream was
closed by cancellation to converge on the persisted terminal state.

### 5. Cancel chat session

`POST /api/chat/:runId/cancel`

Response:

- Status: `200`
- Body: `{ "ok": true, "status": "canceled" | "failed" | "succeeded" }`

Behavior:

- Cancels the Workflow DevKit run (`workflow/api` `getRun(runId).cancel()`).
- Applies a compare-and-swap transition to `canceled` before canceling the
  Workflow run, then returns the authoritative terminal winner. A retry of an
  already persisted `canceled` state retries the idempotent Workflow
  cancellation. Existing terminal states are immutable.
- After runtime cancellation, closes the Workflow run's public stream.
  Connected transports observe EOF, reconnect, and reconcile
  through the terminal-tail contract above.

## Event Schema (UIMessageChunk)

We use the AI SDK UI message streaming format.

### User message markers (required for multi-turn replay)

To ensure correct message ordering on replay, the workflow MUST emit explicit user-message markers in the stream:

- Chunk type: `data-workflow`
- Data payload: `{ domain: "chat", version: 2, type: "user-message", id: string, content: string, files?: FileUIPart[], timestamp: number }`

Reference: “writeUserMessageMarker” in the multi-turn workflow example ([Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling)).

The client accepts historical unversioned user-message markers only because persisted Workflow streams are a replay boundary. All current writers emit the strict `{ domain: "chat", version: 2 }` envelope. Remove the compatibility reader after every pre-v2 run has expired or been deleted and replay inventory shows no remaining unversioned markers.

### Session lifecycle markers

Active lifecycle transitions use:

- `{ domain: "chat", version: 2, type: "session-status", status: "running" | "waiting", timestamp: number }`

Terminal lifecycle uses:

- `{ domain: "chat", version: 2, type: "terminal", status: "succeeded" | "failed" | "canceled", timestamp: number }`

The terminal marker is authoritative: the workflow first performs a terminal-monotonic database transition and reads back the winner. It then emits that status, emits the stream's final `finish`, and closes the stream. A persistence failure emits no terminal marker. The client never interprets a generic stream finish as success.

### Assistant turn streams

The default workflow stream is the canonical `UIMessageChunk` cursor space.
`WorkflowAgent.stream()` receives no writable stream: its model and tool steps
must finish durably before output can become public. The workflow then:

1. builds one canonical assistant `UIMessage` with the deterministic
   `assistant:{workflowRunId}:{turnNumber}` ID;
2. persists that message using the ID as the database conflict boundary; and
3. publishes chunks derived from that persisted message to the default stream,
   wrapped as
   `{ domain: "chat", version: 2, type: "assistant-stream-chunk", assistantMessageId: string, sequence: number, chunk: UIMessageChunk }`.

This ordering removes the append-only producer crash window: a model-step retry
cannot expose a second answer, and a publish step cannot run before the
canonical database write succeeds.

The deterministic assistant message ID and zero-based sequence make a retried
at-least-once publisher emit the same semantic identities. The client
unwraps each accepted identity once across reconnects and fails closed if an
identity is ever reused for a different payload. The outer Workflow chunks
remain atomic and cursor-addressable.

Turn publishing omits `start` after the first assistant turn and never emits a
turn-local `finish`. `writeChatTerminalAndClose` emits the
persisted terminal marker followed by the session's single final `finish`, then
closes the default stream. `writeStreamClose` is restricted to the
non-authoritative finalization-error path.

## Workflow Implementation Contracts (Canonical)

### Workflow function vs step functions

- Workflow functions (`"use workflow"`) are orchestrators and must remain deterministic.
- All side effects (DB reads/writes, network calls, AI Gateway calls, vector/redis operations) MUST be performed in `"use step"` functions ([Workflow DevKit Next.js getting started](https://useworkflow.dev/docs/getting-started/next)).

### Persistence + authorization (required)

- The server MUST persist a client-known thread UUID and one immutable initial
  user message before Workflow dispatch. An invisible start-intent receipt
  binds that complete message, so a changed retry is rejected rather than
  mistaken for an exact replay.
- The server MUST persist a mapping from `workflowRunId` → `projectId` for chat sessions so that:
  - `GET /api/chat/:runId/stream` can authenticate/authorize stream reads.
  - `POST /api/chat/:runId` can authenticate/authorize hook resumes.
  - The UI can resume sessions after refresh/reconnects even when client state (localStorage/sessionStorage) is unavailable.
- Canonical implementation: `chat_threads.workflow_run_id` (unique) + `project_id`.
- The route and the workflow's first step use one atomic ownership claim to
  attach exactly one native Workflow run ID. A losing workflow exits before
  opening streams, persisting messages, registering hooks, or invoking models
  and tools. A route-observed loser is canceled best-effort.
- An exact retry reuses the canonical registered run. A registration ambiguity
  is recovered by reading the durable client-known thread ID.
- Terminal statuses for a chat thread mirror durable runs: `succeeded|failed|canceled`.
- One compare-and-swap transition owner is shared by workflow steps and the cancellation route. Once any terminal status wins, later active or terminal writes cannot replace it.

### Follow-up inbox and exactly-once side effects

- The reusable Workflow hook event log is the canonical durable inbox.
- The workflow confirms hook registration with `getConflict()` before it can
  publish a `waiting` state.
- The HTTP route performs authorization, validation, a read-only ID preflight, and `resume()`; it performs no route-side claim or rollback write.
- The workflow's first step after receiving a hook payload atomically:
  1. verifies the waiting-generation fence;
  2. changes that exact waiting generation to `running`; and
  3. persists the accepted user message or invisible `/done` receipt.
- A newly accepted result may emit a user marker or invoke the model. If the
  process dies after the database transaction commits but before Workflow
  records the step result, replay resumes those side effects only while that
  receipt still owns the current `running` turn.
- An exact already-committed delivery is skipped. Same-ID payload mismatch,
  stale-generation delivery, and non-waiting delivery are also skipped without
  transcript or model side effects.
- Every skipped queued delivery emits a durable disposition keyed by `messageId`.
  The client treats `already_committed` as success and preserves the draft for
  mismatch, stale-generation, and non-waiting rejection outcomes.
- `/done` uses the same admission disposition. A matching rejection unlocks
  the End Session action and retains its stable ID unless the payload mismatched;
  a duplicate remains locked until the authoritative terminal marker arrives.
- A client retry uses the same `messageId`, making an
  event-written/queue-error ambiguity recoverable without a second model turn.

### Chat workflow contract

The chat workflow must:

- Accept `(projectId: string, initialMessage: UIMessage, modeId: string, threadId: string)`.
- Treat that singular message as the complete initial conversation; previous
  assistant/system/history payloads are not a supported start contract.
- Claim `threadId` for its native Workflow run ID as its first side-effecting
  step and exit immediately when it does not own the thread.
- Convert to model messages deterministically.
- Use `@ai-sdk/workflow` `WorkflowAgent` for the durable agent loop ([AI SDK Workflow package](https://github.com/vercel/ai/tree/main/packages/workflow)).
- Build a fresh mode-allowlisted toolset for every assistant turn so one synchronous budget owner covers parallel tool calls.
- Pass immutable per-tool scope with `toolsContext`; validate scoped tools with `contextSchema`.
- Use a workflow hook (`defineHook`) to wait for follow-up messages ([Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling)).
- Do not attach a writable to `WorkflowAgent.stream()`; build and persist one
  canonical result before publishing it to the default UI stream.
- Do not emit the default stream's `finish` chunk until `/done` is received or the session terminates.
- Persist and read back the terminal state before emitting the terminal marker and final `finish`.

### Tool execution + approvals (human-in-loop)

- Side-effectful tools must be approval-gated (**FR-031**, NFR-013).
- Approval gates are modeled as workflow waits (hook/webhook) and resumed by an authenticated UI action.
- Tool steps must be idempotent; retries are expected (PR-005).

## Client Transport Contract (WorkflowChatTransport)

Client must use `useChat` with `WorkflowChatTransport` from `@ai-sdk/workflow` ([AI SDK Workflow package](https://github.com/vercel/ai/tree/main/packages/workflow)).

The client must:

- generate and retain one thread UUID and deterministic initial user-message ID
  before the first POST, reusing both across ambiguous retries;
- load a persisted `pending` intent and automatically retry it with the same
  thread/message identities after a page reload, selecting the one persisted
  user row without relying on database timestamp ordering;
- reject a start response whose thread header does not match that UUID;
- decode deterministic assistant envelopes through one transport-lifetime
  identity map so reconnects cannot duplicate semantic chunks; and
- reconcile generic EOF and transport errors through authenticated
  `GET /api/chat/:runId`, clearing active identity only after an authoritative
  terminal result.

Memoization policy follows `$vercel-react-best-practices`:

- Prefer a stable transport instance (e.g., `useState(() => new WorkflowChatTransport(...))`) and refs/effects for mutable session state (`advanced-event-handler-refs`).
- Use memoization (`useMemo`, `useCallback`, `React.memo`) only when it measurably reduces expensive work or prevents costly re-renders (`rerender-memo`).
- Avoid memo for simple primitives/cheap computations (`rerender-simple-expression-in-memo`).

## Testing Requirements (Contract + Integration)

### Contract tests (Vitest)

- `POST /api/chat`:
  - rejects missing/invalid `projectId`
  - rejects missing/invalid `threadId`
  - rejects missing/invalid/non-user `message` and removed history arrays
  - persists the immutable start intent before dispatch
  - reuses an exact start retry and rejects a conflicting UUID payload
  - recovers canonical ownership after an ambiguous dispatch result
  - returns `x-workflow-run-id` header on success
  - returns a persisted `x-chat-thread-id` header on success
- `POST /api/chat/:runId`:
  - does no route-side durable claim or rollback
  - rejects reserved assistant IDs and same-ID payload mismatches
  - preserves exact retry idempotency across ambiguous hook-resume failures
- `GET /api/chat/:runId/stream`:
  - rejects invalid `startIndex`
  - resumes from `startIndex` without duplication (cursor correctness)
  - drains remaining native chunks before terminal reconciliation
  - emits the authoritative terminal marker after the native tail
- `POST /api/chat/:runId/cancel`:
  - persists the terminal compare-and-swap before runtime cancellation
  - closes every run stream after cancellation
- `GET /api/chat/:runId`:
  - returns the authorized, authoritative lifecycle state

Implemented in:

- `src/app/api/chat/__tests__/route.test.ts`
- `src/app/api/chat/[runId]/__tests__/route.test.ts`
- `src/app/api/chat/[runId]/stream/__tests__/route.test.ts`
- `src/app/api/chat/[runId]/cancel/__tests__/route.test.ts`

### Integration tests (Vitest)

- `src/workflows/chat/steps/assistant-turn-stream.step.test.ts` verifies
  canonical buffering, deterministic IDs, publish lifecycle filtering, and
  identical sequence identities after a publish-step retry.
- `src/workflows/chat/project-chat.workflow.test.ts` verifies multi-turn
  first-step ownership fencing, persist-before-publish ordering, producer
  crash-window closure, follow-ups, and final stream closure.
- `src/lib/data/chat-start.server.test.ts` verifies immutable pre-dispatch
  single-message intent persistence, exact retry, payload/identity conflict
  detection, and atomic Workflow ownership.
- `src/lib/chat/replay-safe-stream.test.ts` verifies duplicate suppression
  across reconnects and divergent-identity rejection.
- `src/lib/data/chat-follow-up.server.test.ts` verifies atomic hook consumption,
  post-commit process-death recovery, duplicate and mismatch handling,
  stale-generation fencing, and invisible `/done` receipts.
- `src/lib/data/chat-thread-state.server.test.ts` verifies terminal immutability and cancellation/finalization compare-and-swap races.
- `src/app/(app)/projects/[projectId]/chat/chat-client.lifecycle.test.tsx`
  verifies generic-finish safety, authoritative terminal markers,
  generic-close reconciliation, stable start identity,
  pending-start reload recovery, queued-admission acknowledgements,
  rejected-draft preservation, `/done` disposition recovery, and retry ID reuse
  or rotation.

- Multi-turn flow:
  1. start session, capture run id
     - assert the initial stream emits > 0 chunks and includes expected content tokens/phrases
     - record the last chunk id/sequence number for continuity checks
  2. send follow-up message to hook endpoint
     - assert the follow-up stream emits additional chunks for the same run id
     - validate run state via the run API (for example, `status` is `running`, `waiting`, or `succeeded`)
  3. assert stream continuity
     - verify chunk sequence numbers are monotonic and resume after the last recorded chunk id
