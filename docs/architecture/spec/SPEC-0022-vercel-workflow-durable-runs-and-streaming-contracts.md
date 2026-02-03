---
spec: SPEC-0022
title: Durable runs & streaming contracts (Vercel Workflow DevKit)
version: 0.1.0
date: 2026-02-03
owners: ["you"]
status: Proposed
related_requirements:
  ["FR-008", "FR-010", "FR-011", "FR-023", "FR-031", "IR-001", "IR-004", "NFR-004", "NFR-013", "PR-001", "PR-004", "PR-005"]
related_adrs: ["ADR-0026", "ADR-0006", "ADR-0007", "ADR-0021", "ADR-0014"]
notes: "Defines the canonical Workflow DevKit integration for multi-turn chat and durable runs, including resumable streaming contracts, hook endpoints, and event schemas."
---

## Summary

This spec defines the **canonical** interactive-orchestration implementation for this repo:

- Use **Vercel Workflow DevKit** (`workflow` + `@workflow/ai`) for:
  - durable interactive runs and multi-turn chat sessions
  - streaming responses that can resume after timeouts/disconnects
  - human-in-the-loop waits/resume
- Use **Upstash QStash** only for **background jobs** (ingestion), per ADR-0005.

This spec is the implementation-level companion to:

- [ADR-0026](../adr/ADR-0026-orchestration-vercel-workflow-devkit-for-interactive-runs.md)
- [SPEC-0021](./SPEC-0021-full-stack-finalization-fluid-compute-neon-upstash-ai-elements.md)

## Goals

- Define **decision-complete** API contracts for starting and resuming streams.
- Define a multi-turn **chat session** workflow pattern that:
  - keeps one workflow run open across multiple user turns
  - persists session state inside the workflow
  - writes user-message markers into the stream for correct replay ordering
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

1. Client starts session (POST `/api/chat`) → server starts workflow run → server returns stream + `x-workflow-run-id`.
2. Client injects follow-ups (POST `/api/chat/:runId`) → server resumes a workflow hook.
3. Client can reconnect at any time (GET `/api/chat/:runId/stream?startIndex=`) to resume streaming without duplicating chunks.

Reference pattern: “Multi-Turn Workflows” ([Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling)).

## API Contracts (Canonical)

All contracts are validated with Zod v4 on the server.

### 1) Start chat session

`POST /api/chat`

Request body (JSON):

- `projectId`: string (required)
- `messages`: `UIMessage[]` (required)
  - The last message MUST be a `user` message for session start.

Response:

- Status: `200`
- Headers:
  - `x-workflow-run-id`: string (required) — identifies the durable run + stream ([Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams)).
- Body: an AI SDK UI message event stream (SSE-compatible) that may remain open across turns.

### 2) Send follow-up message (resume hook)

`POST /api/chat/:runId`

Request body (JSON):

- `message`: string (required)

Response:

- Status: `200`
- Body: `{ "ok": true }`

### 3) Reconnect to stream (resume)

`GET /api/chat/:runId/stream?startIndex=N`

Query params:

- `startIndex`: integer (optional) — the client’s last received chunk index.

Response:

- Status: `200`
- Body: AI SDK UI message event stream that resumes from `startIndex` ([Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams)).

## Event Schema (UIMessageChunk)

We use the AI SDK UI message streaming format.

### User message markers (required for multi-turn replay)

To ensure correct message ordering on replay, the workflow MUST emit explicit user-message markers in the stream:

- Chunk type: `data-workflow`
- Data payload: `{ type: "user-message", id: string, content: string, timestamp: number }`

Reference: “writeUserMessageMarker” in the multi-turn workflow example ([Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling)).

## Workflow Implementation Contracts (Canonical)

### Workflow function vs step functions

- Workflow functions (`"use workflow"`) are orchestrators and must remain deterministic.
- All side effects (DB reads/writes, network calls, AI Gateway calls, vector/redis operations) MUST be performed in `"use step"` functions ([Workflow DevKit Next.js getting started](https://useworkflow.dev/docs/getting-started/next)).

### Chat workflow contract

The chat workflow must:

- Accept `(projectId: string, initialMessages: UIMessage[])`.
- Convert to model messages deterministically.
- Use `@workflow/ai` `DurableAgent` for the agent loop ([DurableAgent](https://useworkflow.dev/docs/api-reference/workflow-ai/durable-agent)).
- Use a workflow hook (`defineHook`) to wait for follow-up messages ([Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling)).
- Keep the stream open across turns:
  - `preventClose: true`
  - do not emit `finish` until `/done` is received (or explicit UI end-session).

### Tool execution + approvals (human-in-loop)

- Side-effectful tools must be approval-gated (**FR-031**, NFR-013).
- Approval gates are modeled as workflow waits (hook/webhook) and resumed by an authenticated UI action.
- Tool steps must be idempotent; retries are expected (PR-005).

## Client Transport Contract (WorkflowChatTransport)

Client must use `useChat` with `WorkflowChatTransport` ([WorkflowChatTransport](https://useworkflow.dev/docs/api-reference/workflow-ai/workflow-chat-transport)).

Repo constraint: **no manual memoization** (`useMemo`, `useCallback`). The implementation must:

- create the transport once (e.g., `useState(() => new WorkflowChatTransport(...))`)
- use `useEffect` for reading/writing localStorage state (run id)
- avoid useMemo-based derived state; derive message view models directly in render

## Testing Requirements (Contract + Integration)

### Contract tests (Vitest)

- `POST /api/chat`:
  - rejects missing/invalid `projectId`
  - rejects missing/invalid `messages`
  - returns `x-workflow-run-id` header on success
- `GET /api/chat/:runId/stream`:
  - rejects invalid `startIndex`
  - resumes from `startIndex` without duplication (cursor correctness)

### Integration tests (Vitest)

- Multi-turn flow:
  1. start session, capture run id
  2. send follow-up message to hook endpoint
  3. assert streamed output continues for the same run id
