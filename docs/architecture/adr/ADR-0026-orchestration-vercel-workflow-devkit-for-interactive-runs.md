---
ADR: 0026
Title: Orchestration: Vercel Workflow DevKit for interactive runs (QStash for background jobs)
Status: Implemented
Version: 0.1
Date: 2026-02-03
Supersedes: []
Superseded-by: []
Related: [ADR-0005, ADR-0006, ADR-0011, ADR-0021]
Tags: [architecture, reliability, workflows]
References:
  - [Vercel Workflow](https://vercel.com/docs/workflow)
  - [Workflow DevKit: Next.js setup](https://useworkflow.dev/docs/getting-started/next)
  - [Workflow DevKit: Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams)
  - [Workflow DevKit: Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling)
  - [Workflow DevKit: WorkflowChatTransport](https://useworkflow.dev/docs/api-reference/workflow-ai/workflow-chat-transport)
  - [Upstash Workflow: AI SDK integration](https://upstash.com/docs/workflow/integrations/aisdk)
  - [Upstash Workflow: Next.js quickstart](https://upstash.com/docs/workflow/quickstarts/vercel-nextjs)
  - [Upstash QStash: Next.js quickstart](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs)
---

## Status

Implemented — 2026-02-05.

## Description

Use **Vercel Workflow DevKit** (`workflow` + `@workflow/ai`) for the app’s *interactive* agent workloads:

- multi-turn chat sessions
- durable runs
- streaming UI responses that can resume after disconnects/timeouts
- human-in-the-loop (wait/resume) patterns

Use **Upstash QStash** only for **background jobs** (primarily the ingestion pipeline and other non-interactive fanout tasks).

See:

- [SPEC-0021](../spec/SPEC-0021-full-stack-finalization-fluid-compute-neon-upstash-ai-elements.md) (integrator spec)
- [SPEC-0022](../spec/SPEC-0022-vercel-workflow-durable-runs-and-streaming-contracts.md) (durable runs + streaming contracts)

## Context

This app is streaming-first (AI Elements UI) and must reliably survive:

- function timeouts / transient network interruptions
- page refreshes mid-response
- “approve and resume” pauses for side-effectful operations

Queue-first orchestration (QStash-only) can deliver durability, but it makes the
**streaming/resumption** path significantly more complex. Workflow DevKit
provides first-class streaming primitives and stream resumption patterns for
Next.js on Vercel. [Workflow DevKit: Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams)

Upstash Workflow is strong for durable execution (it is built on QStash), but
its AI SDK integration documentation emphasizes wrapping model calls via
`context.call` with a custom `fetch` implementation, which is not a browser
streaming transport. [Upstash Workflow: AI SDK integration](https://upstash.com/docs/workflow/integrations/aisdk)

## Decision Drivers

- Streaming-first UX with resumability (core product requirement)
- Durability + retries without reinventing a workflow engine
- Fit with Next.js App Router + Vercel deployment model
- Clear separation between interactive workloads and background ingestion
- Maintainability under strict TS constraints and repo non-negotiables

## Alternatives Considered

### A. Vercel Workflow DevKit for interactive runs/chat + QStash for background ingestion (**Chosen**)

Pros:

- Native streaming primitives + resumable streams for UI responses. [Workflow DevKit: Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams)
- Multi-turn session pattern supported via hooks and run IDs. [Workflow DevKit: Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling)
- Minimal external infra on the interactive path (no Redis/Realtime dependency for streaming).

Cons:

- Workflow DevKit is beta/experimental; APIs and pricing may change. [Vercel Workflow](https://vercel.com/docs/workflow)

### B. Upstash Workflow SDK for everything

Pros:

- Durable execution with QStash under the hood.
- Clear, hosted primitives for steps, retries, and long execution horizons. [Upstash Workflow: Next.js quickstart](https://upstash.com/docs/workflow/quickstarts/vercel-nextjs)

Cons:

- Requires additional transport glue for streaming-first UX (typically involving Realtime/SSE replay patterns).
- Adds external infra/secrets into the core interactive chat path (QStash + potentially Redis/Realtime).
- AI SDK integration path centers on wrapping fetch calls via `context.call` (durability), not on streaming/resume semantics. [Upstash Workflow: AI SDK integration](https://upstash.com/docs/workflow/integrations/aisdk)

### C. Hybrid: Vercel Workflow for chat/runs + Upstash Workflow for ingestion

Pros:

- Preserves the Vercel-native interactive streaming path.

Cons:

- Ingestion primarily needs durable delivery and retries; QStash alone is sufficient and simpler. [Upstash QStash: Next.js quickstart](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs)

### D. QStash-only for everything

Pros:

- Durable delivery, retries, signatures. [Upstash QStash: Next.js quickstart](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs)

Cons:

- Too low-level for interactive, resumable streaming runs; would require implementing run state machines, stream replay, and human-in-loop waits manually.

### Decision Framework

Scoring includes maintainability and UX constraints from this repo (strict TS,
no `useMemo`/`useCallback`, no barrel imports, Next App Router).

| Criterion | Weight | A Raw | A Weighted | B Raw | B Weighted | C Raw | C Weighted | D Raw | D Weighted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Solution leverage | 0.35 | 9.3 | 3.26 | 6.8 | 2.38 | 8.2 | 2.87 | 5.8 | 2.03 |
| Application value | 0.30 | 9.4 | 2.82 | 7.1 | 2.13 | 8.5 | 2.55 | 6.2 | 1.86 |
| Maintenance & cognitive load | 0.25 | 9.1 | 2.28 | 6.4 | 1.60 | 7.6 | 1.90 | 5.4 | 1.35 |
| Architectural adaptability | 0.10 | 9.2 | 0.92 | 7.0 | 0.70 | 8.1 | 0.81 | 6.9 | 0.69 |

**Weighted totals ( / 10.0 ):**

- Option A: **9.28**
- Option B: **6.81**
- Option C: **8.13**
- Option D: **5.93**

## Decision

We will:

1. Adopt **Vercel Workflow DevKit** (`workflow` + `@workflow/ai`) for:
   - chat sessions (multi-turn, resumable streams)
   - durable runs / step orchestration on the interactive path
2. Keep **Upstash QStash** for:
   - ingestion jobs (upload → extract → chunk → embed → vector)
   - other background delivery use cases where streaming to the browser is not required

## Constraints

- Workflow DevKit requires:
  - wrapping `next.config.ts` with `withWorkflow(…)` to enable directives. [Workflow DevKit: Next.js setup](https://useworkflow.dev/docs/getting-started/next)
  - excluding `.well-known/workflow/` from the Next.js `proxy.ts` matcher to avoid blocking internal workflow routes. [Workflow DevKit: Next.js setup](https://useworkflow.dev/docs/getting-started/next)
  - setting `workflows.dirs` in `next.config.ts` (inside `withWorkflow(…)`) to narrowly scope scanned workflow directories (for example `workflows/` or `src/workflows/`) and avoid out-of-memory build failures from broad filesystem scans. [Workflow DevKit: Next.js setup](https://useworkflow.dev/docs/getting-started/next)
- QStash endpoints must verify signatures (and be idempotent) for ingestion workers. [Upstash QStash: Next.js quickstart](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs)
- Memoization follows `$vercel-react-best-practices`: prefer refs/effects for transient mutable values; use `useMemo`/`useCallback` only for genuinely expensive work or to prevent costly re-renders (`rerender-memo`), and avoid memo for cheap primitives (`rerender-simple-expression-in-memo`).

## High-Level Architecture

```mermaid
flowchart LR
  UI[AI Elements UI] --> ChatAPI[POST /api/chat<br/>starts workflows]
  UI --> ChatFollowup[POST /api/chat/:runId<br/>followup actions]
  UI --> ChatStream[GET /api/chat/:runId/stream<br/>resumes streams]

  ChatAPI --> WF[Workflow Run]
  ChatFollowup --> WF
  ChatStream --> WF

  WF --> DB[(Neon Postgres)]
  WF --> AIGW[Vercel AI Gateway]
  WF --> VECTOR[(Upstash Vector)]
  WF --> REDIS[(Upstash Redis)]

  UploadToken[POST /api/upload<br/>Blob token exchange] --> Register[POST /api/upload/register<br/>register + ingest (or enqueue)]
  Register --> Q[QStash<br/>POST /api/jobs/ingest-file]
  Q --> Ingest[POST /api/jobs/ingest-file]
  Ingest --> DB
  Ingest --> VECTOR
```

## Testing

- Contract:
  - `POST /api/chat` authenticates/authorizes before starting workflow execution and before returning `x-workflow-run-id` in the response header. [Workflow DevKit: Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams)
  - `GET /api/chat/{runId}/stream` (or `/api/chat/:runId/stream`) authenticates/authorizes before allowing stream reads; `startIndex` must parse as a non-negative integer (reject malformed values), and the resumed GET stream must not duplicate chunks per Workflow DevKit resumable streams behavior. [Workflow DevKit: Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams)
  - Optional implementation note: when returning the `POST /api/chat` stream response, set `x-workflow-run-id` via `createUIMessageStreamResponse({ stream, headers })`. The `headers` parameter accepts `Headers | Record<string, string>`, so handlers can pass `{ "x-workflow-run-id": runId }`. The stream resume endpoint still must validate `startIndex` as a non-negative integer and resume without duplicate chunks.
- Integration:
  - QStash signature verification rejects unsigned requests, and tests assert signature middleware wrapping for async ingestion routes. [Upstash QStash: Next.js quickstart](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs)
  - ingestion pipeline uses QStash for async path and remains idempotent.

## Related Requirements

- **FR-008:** project-scoped multi-turn chat with resumable streaming.
- **FR-010:** durable multi-step runs.
- **FR-011:** persisted run-step status, tool calls, and artifacts.
- **NFR-004:** observability of run/stream failures.
- **PR-004:** stream and run resumption after disconnects/timeouts.
- **PR-005:** idempotent/retry-safe workflow steps.
- **IR-004:** interactive runs via Workflow DevKit and background jobs via QStash.

## Consequences

### Positive Outcomes

- Best-in-class streaming-first UX with durable resumption.
- Clear separation of interactive orchestration from background ingestion delivery.
- Lower long-term complexity than queue-only orchestration for interactive runs.

### Trade-offs

- Workflow DevKit is currently beta/experimental; we must track upstream changes and pin versions carefully. [Vercel Workflow](https://vercel.com/docs/workflow)
