---
spec: SPEC-0023
title: AI Elements workspace UI and interaction model
version: 0.1.0
date: 2026-02-03
owners: ["you"]
status: Proposed
related_requirements:
  ["FR-002", "FR-003", "FR-008", "FR-010", "FR-020", "FR-023", "FR-031", "PR-001", "NFR-008", "NFR-010"]
related_adrs: ["ADR-0011", "ADR-0006", "ADR-0026", "ADR-0013"]
notes: "Defines the Next.js App Router workspace UI that exposes all app capabilities using AI Elements + shadcn/ui, with streaming-first chat and durable runs."
---

## Summary

This spec defines the **UI/UX** and **interaction model** for the app’s workspace:

- Next.js App Router (Server Components-first)
- AI Elements for chat/runs visualization primitives
- shadcn/ui for general UI components
- Streaming-first chat with resumable streams via Workflow DevKit (SPEC-0022)

This spec is the UI companion to:

- [SPEC-0021](./SPEC-0021-full-stack-finalization-fluid-compute-neon-upstash-ai-elements.md)
- [SPEC-0022](./SPEC-0022-vercel-workflow-durable-runs-and-streaming-contracts.md)

## UI Principles (Non-negotiable)

- Server Components for data reads; Client Components only for interactive surfaces.
- Avoid waterfalls: parallelize independent fetches (`Promise.all`) and stream with Suspense.
- **No manual memoization**: do not use `useMemo` or `useCallback` (repo rule).
- **No barrel files**: import from concrete module paths only.
- Accessibility baseline: shadcn/ui + semantic HTML, keyboard nav, focus states.
- Use `next/image` for rendered images and configure external domains via `images.remotePatterns` (use `unoptimized` for blob/data URLs as needed). [Next.js Image component](https://nextjs.org/docs/app/api-reference/components/image).
- Lazy-load heavy client renderers (Streamdown, syntax highlighting) with `next/dynamic` to reduce initial JS. [Next.js lazy loading](https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading).

## Information Architecture (IA)

### Primary navigation

Workspace is project-centered and deep-linkable:

- `/projects` (project list)
- `/projects/[projectId]` (project overview)
- `/projects/[projectId]/uploads`
- `/projects/[projectId]/chat`
- `/projects/[projectId]/runs`
- `/projects/[projectId]/search`
- `/projects/[projectId]/settings`

### Required page conventions

- Each tab page must render a **fast static shell** and stream dynamic sections.
- Each page must have:
  - clear empty state
  - skeleton/placeholder for async sections
  - errors routed to `error.tsx` boundaries where appropriate.

## AI Elements Component Strategy

AI Elements components are **vendored** into the repo (source code owned by this project), installed via the AI Elements CLI into:

- `src/components/ai-elements/**`

We treat AI Elements components as “primitive UI building blocks”, not a black-box library.

Reference index (component docs + API refs): [AI Elements docs index](https://elements.ai-sdk.dev/llms.txt)

### Required AI Elements components to vendor (P0)

Chat:

- `conversation` (Conversation shell + scroll behavior)
- `message` (Message + MessageContent + MessageResponse)
- `prompt-input` (PromptInputTextarea + PromptInputSubmit, etc.)

Runs/workflow visualization:

- workflow example primitives (Canvas/Node/Edge/Controls/Connection), as applicable to our run model ([AI Elements workflow example](https://elements.ai-sdk.dev/examples/workflow)).

## Chat UI (Streaming-first, Multi-turn)

### UX goals

- First token fast (PR-001).
- Never “lose” an in-progress response on refresh or network hiccup.
- Follow-ups should feel instant (optimistic user message) while the workflow run continues to stream.

### Data + transport model

We use Workflow DevKit multi-turn chat session modeling:

- One durable workflow run per chat session (`runId`)
- Follow-up messages injected via hook resume endpoint
- Stream reconnection endpoint supports `startIndex` resume cursor

Reference: [Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling) and [Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams).

### Client implementation constraints (no useMemo/useCallback)

We implement a client hook that wraps `useChat` + `WorkflowChatTransport` while respecting repo constraints:

- Create the transport exactly once via `useState(() => new WorkflowChatTransport(...))`
- Use `useEffect` to:
  - load a stored `runId` from localStorage (if present)
  - persist new `runId` when returned in `x-workflow-run-id`
- Derive the “renderable message list” directly during render (no memoization):
  - parse assistant message parts
  - when encountering `data-workflow` user-message markers, insert synthetic user messages for correct replay ordering

Transport reference: [WorkflowChatTransport](https://useworkflow.dev/docs/api-reference/workflow-ai/workflow-chat-transport)

### Rendering with AI Elements

Use AI Elements primitives for message rendering:

- `Conversation` wraps the scrolling region
- `ConversationContent` contains the message list
- `ConversationScrollButton` appears when user scrolls away
- `Message` and `MessageContent` wrap each message
- `MessageResponse` renders streaming content (Streamdown-compatible)
- `PromptInputTextarea` + `PromptInputSubmit` compose the input

All AI Elements component names and usage are sourced from the AI Elements docs index ([AI Elements docs index](https://elements.ai-sdk.dev/llms.txt)).

## Runs UI (Durable run timeline + workflow visualization)

### P0: Timeline view

Initial Runs tab must show:

- current run status (running/waiting/blocked/succeeded/failed/canceled)
- step list with timestamps and outputs
- approvals required (FR-031)
- “resume” action when blocked
- a resilient stream view that never remains stuck in `streaming` after the SSE
  connection ends unexpectedly (show interruption banner + reconnect)

### P1: Graph view (AI Elements workflow example baseline)

Add an optional graph visualization based on AI Elements workflow example primitives ([AI Elements workflow example](https://elements.ai-sdk.dev/examples/workflow)).

Nodes represent step kinds:

- `llm`, `tool`, `sandbox`, `wait`, `approval`, `external_poll`

Edges represent transitions and conditional branches.

## Uploads UI

Uploads tab must:

- show latest uploaded files + ingest status
- allow async ingestion (`?async=true`) as default for larger files
- show extraction/chunk/embed/index counters (if available)

## Search UI

Search tab must:

- allow project-scoped vector search
- show retrieved chunk snippets + source file metadata
- respect top-k/budget constraints (ADR-0013)

## Settings UI

Settings tab must expose:

- budgets (retrieval top-k, embedding batch size)
- integration status (AI Gateway key present, Upstash vector configured, etc.)
- environment mode (dev/preview/prod) display (read-only)

## Test Scenarios (UI acceptance)

- Chat:
  - start session, stream tokens, refresh mid-stream, stream resumes
  - send follow-up while session active and see new assistant output stream
- Runs:
  - run shows steps updating in real time (poll or stream depending on implementation)
  - approval gate blocks UI until approved, then resumes
  - cancel run surfaces `canceled` terminal state (not failed)
  - stream ending without a finish sentinel transitions out of `streaming` and
    can reconnect/resume from `startIndex`
- Uploads:
  - async ingestion path triggers background job and status updates
