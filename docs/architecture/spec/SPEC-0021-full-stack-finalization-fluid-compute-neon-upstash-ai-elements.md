---
spec: SPEC-0021
title: Full-stack finalization (Fluid Compute + Neon/Drizzle + Upstash + AI Gateway + AI Elements UI)
version: 0.1.4
date: 2026-02-06
owners: ["Bjorn Melin"]
status: Implemented
related_requirements:
  [
    "FR-003",
    "FR-004",
    "FR-005",
    "FR-006",
    "FR-007",
    "FR-008",
    "FR-010",
    "FR-011",
    "FR-012",
    "FR-019",
    "FR-020",
    "FR-021",
    "FR-023",
    "FR-031",
    "IR-001",
    "IR-004",
    "IR-005",
    "IR-006",
    "IR-002",
    "NFR-003",
    "NFR-004",
    "NFR-006",
    "NFR-007",
    "NFR-010",
    "NFR-011",
    "PR-001",
    "PR-002",
    "PR-003",
    "PR-004",
    "PR-005"
  ]
related_adrs:
  [
    "ADR-0003",
    "ADR-0004",
    "ADR-0005",
    "ADR-0006",
    "ADR-0007",
    "ADR-0009",
    "ADR-0011",
    "ADR-0013",
    "ADR-0014",
    "ADR-0021",
    "ADR-0025"
  ]
notes: "Cross-cutting implementation spec for Neon/Drizzle, Upstash (Redis/Vector/QStash), AI Gateway, AI Elements UI, cache components, and ownership-scoped search hardening."
---

## Summary

This spec is the “stitching document” that finalizes the end-to-end system:

- **Persistence**: Neon Postgres via Drizzle ORM on Vercel **Fluid Compute**, using `pg` pooling + `attachDatabasePool` ([Vercel Functions package reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)) ([Vercel Fluid Compute](https://vercel.com/docs/fluid-compute)).
- **Ingestion**: Blob → extract → chunk → embed → Upstash Vector, with idempotency and bounded costs.
- **Retrieval**: project-scoped search and retrieval tool(s), with Redis caching.
- **Durable orchestration**:
  - **Interactive runs + chat**: Vercel Workflow DevKit (`workflow` + `@workflow/ai`) with resumable streams ([Vercel Workflow](https://vercel.com/docs/workflow), [Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams)).
  - **Background jobs** (ingestion + fanout): Upstash QStash-signed route handlers ([QStash Next.js quickstart](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs)).
- **UI**: Next.js App Router workspace that uses **AI Elements** (chat/streaming/workflow UI) + shadcn/ui (everything else).

This spec explicitly documents:

- what is already implemented (code snapshot)
- how Vercel/Neon/Upstash environments and secrets should be configured

## Scope / Non-goals

### In scope

- Bring the repo to a “production-ready, final-release” posture for the DB + RAG + workflows + UI stack.
- Document Vercel Fluid Compute implications and required patterns (pooling, Node runtime).
- Define the final UI/UX information architecture and the API contracts it requires.
- Define integration test coverage (DB, ingestion, retrieval, QStash signature verification).

### Out of scope (explicitly deferred)

- Multi-tenant authorization model (this app is single-user by default).
- Public sign-up (see ADR-0023).
- Full Playwright E2E suite (we define the plan and the minimum smoke tests; expanding to full E2E is a follow-on).

## Current Implementation Snapshot (Repo Truth)

This section is the authoritative snapshot of the current repository state as of **2026-02-03**.

### Database (Neon + Drizzle)

- Schema: `src/db/schema.ts`
- Migrations: `src/db/migrations/**`
- Runtime client: `src/db/client.ts`
  - Uses `pg` pooling with `drizzle-orm/node-postgres`
  - On Vercel Fluid Compute, attaches the pool with `attachDatabasePool` (`@vercel/functions`) ([Vercel Functions package reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)).
- Integration test (gated by `DATABASE_URL`): `tests/integration/db.test.ts`

### Ingestion pipeline (Blob → extract → chunk → embed → vector)

- Upload Route Handler: `src/app/api/upload/route.ts`
  - Uploads to Vercel Blob (original preserved)
  - Writes DB metadata (including sha256 idempotency)
  - Supports inline ingestion or async ingestion via QStash (`?async=true`)
- Ingest worker (QStash-signed): `src/app/api/jobs/ingest-file/route.ts`
- Extraction: `src/lib/ingest/extract/extract-document.server.ts`
- Chunking: `src/lib/ingest/chunk/chunk-document.server.ts`
- Orchestrator: `src/lib/ingest/ingest-file.server.ts`
- Embeddings (AI Gateway): `src/lib/ai/embeddings.server.ts`
- Vector client: `src/lib/upstash/vector.server.ts`
- Budgets: `src/lib/config/budgets.server.ts`

### Retrieval + search

- Retrieval tool wrapper: `src/lib/ai/tools/retrieval.server.ts`
  - Optional Redis caching (if configured)
  - Enforces top-k bounds and project scoping
- Search Route Handler: `src/app/api/search/route.ts`
  - Supports `scope`, `types`, `limit`, `cursor` query params.
  - Project-scoped: uploads/chunks/artifacts/runs.
  - Global: projects/uploads/chunks/artifacts/runs.
  - Non-breaking compatibility for legacy `q + projectId` requests.

### Durable runs / orchestration

- Runs Route Handler: `src/app/api/runs/route.ts`
- Run stream Route Handler: `src/app/api/runs/[runId]/stream/route.ts`
- Run cancel Route Handler: `src/app/api/runs/[runId]/cancel/route.ts`
- Workflow DevKit run orchestrator: `src/workflows/runs/project-run.workflow.ts`
- DAL:
  - `src/lib/data/projects.server.ts`
  - `src/lib/data/files.server.ts`
  - `src/lib/data/runs.server.ts`
- QStash helpers (background jobs): `src/lib/upstash/qstash.server.ts`

**Note:** Durable runs and interactive streaming are implemented via **Vercel Workflow DevKit** using `/api/runs/*` and `src/workflows/runs/**`. QStash remains the durable delivery mechanism for **background jobs** (especially ingestion).

#### Research Notes: Upstash Workflow vs Vercel Workflow (Streaming Path)

We evaluated **Upstash Workflow** (`@upstash/workflow`) as an alternative durable engine for interactive chat/runs. Upstash Workflow’s AI SDK integration guide focuses on durability by routing model HTTP calls through `context.call` via a custom `fetch` implementation ([Upstash Workflow AI SDK integration](https://upstash.com/docs/workflow/integrations/aisdk)).

For this app, the primary UX requirement is **streaming-first, resumable UI** (AI Elements). Workflow DevKit provides a native pattern for resumable streams (run id + `startIndex` cursor) and a transport helper (`WorkflowChatTransport`) that is aligned with AI SDK `useChat` ([Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams), [WorkflowChatTransport](https://useworkflow.dev/docs/api-reference/workflow-ai/workflow-chat-transport)).

### UI (Implemented - Initial Workspace)

Workspace pages under `src/app/(app)/…` are implemented and are protected by
`requireAppUser()`:

- `/projects` (list + create)
- `/projects/[projectId]` (overview)
- `/projects/[projectId]/uploads` and `/projects/[projectId]/uploads/[fileId]`
- `/projects/[projectId]/chat` (AI Elements + WorkflowChatTransport resumable streams)
- `/projects/[projectId]/search`
- `/projects/[projectId]/runs`
- `/projects/[projectId]/settings`
- `/search` (global search)

shadcn/ui + AI Elements component code is vendored:

- AI Elements: `src/components/ai-elements/**` (chat UI currently uses `conversation`, `message`, `prompt-input`, `reasoning`, `tool`)
- shadcn/ui: `src/components/ui/**`
- shared search UI: `src/components/search/**`
- Shared utilities: `src/lib/utils.ts`

Route handler tests exist for `/api/chat`:

- `src/app/api/chat/__tests__/route.test.ts`
- `src/app/api/chat/[runId]/__tests__/route.test.ts`
- `src/app/api/chat/[runId]/stream/__tests__/route.test.ts`

## Target Architecture (Final System Shape)

```mermaid
flowchart LR
  subgraph Client[Browser]
    UI[Next.js UI<br/>AI Elements + shadcn/ui]
  end

  subgraph App[Next.js App Router]
    RH[Route Handlers<br/>/api/*]
    SA[Server Actions]
    RSC[Server Components]
  end

  UI --> RH
  UI --> SA
  UI --> RSC

  RH --> DB[(Neon Postgres)]
  RH --> BLOB[(Vercel Blob)]
  RH --> REDIS[(Upstash Redis)]
  RH --> VECTOR[(Upstash Vector)]
  RH --> WF[(Vercel Workflow)]
  RH --> QSTASH[(Upstash QStash)]
  RH --> AIGW[Vercel AI Gateway]

  SA --> DB
  RSC --> DB
```

## Vercel Runtime & Fluid Compute Requirements

### Node.js runtime required for DB work

All DB and ingestion routes that depend on `pg`/Drizzle must execute on Node.js runtime (not Edge).

### Pooling policy (Fluid Compute)

- Create a single `pg` Pool per module instance.
- Immediately call `attachDatabasePool(pool)` so idle clients are released before a function suspends.
  - Reference: Vercel Functions package `attachDatabasePool` docs.
    - [Vercel Functions package reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package).

### Fluid Compute enablement

Fluid Compute is enabled by default for new Vercel projects, but can be explicitly controlled per project via `vercel.json` ([Vercel Fluid Compute](https://vercel.com/docs/fluid-compute), [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)).

```jsonc
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "fluid": true
}
```

Reference: [Vercel Fluid Compute](https://vercel.com/docs/fluid-compute)

## Environments, Branching, and Secrets (Vercel + Neon + Upstash)

This section is decision-complete for how environments should work across local
development, Vercel Preview deployments, and Production.

### Environment tiers

We use Vercel’s standard env tiers and keep the contracts aligned with
[docs/ops/env.md](/docs/ops/env.md) and `src/lib/env.ts` (ADR-0021 / SPEC-0015):

- **Development**: local dev + `vercel dev` + Vercel “Development” env vars.
- **Preview**: per-branch deployments (and, when enabled, per-branch Neon DB branch).
- **Production**: stable, production deployment + production resources.

### Neon ↔ Vercel integration (recommended)

Use the Neon marketplace integration with Preview Branching enabled when
possible ([Neon on Vercel integration](https://neon.com/docs/guides/vercel)).

- `DATABASE_URL` is injected per Preview branch automatically.
- When Neon Auth is enabled, `NEON_AUTH_BASE_URL` is also injected per Preview branch.

References:

- [Neon on Vercel integration](https://neon.com/docs/guides/vercel)
- [Neon “Vercel connection methods”](https://neon.com/docs/guides/vercel-connection-methods)

### Upstash integration (recommended)

Use Vercel Marketplace integrations for: [Upstash joins the Vercel Marketplace](https://vercel.com/changelog/upstash-joins-the-vercel-marketplace)

- Upstash Redis (caching)
- Upstash Vector (retrieval)
- Upstash QStash (durable workflows)

The REST tokens are secrets and must be configured via Vercel environment
variables. Tokens can be shared across environments, but production should
prefer production-scoped resources and tokens.

### Env var matrix (minimum required)

These are “minimum required for full functionality” env vars. Each group is
feature-gated in `src/lib/env.ts` and documented in [docs/ops/env.md](/docs/ops/env.md).

- **DB**:
  - `DATABASE_URL`
- **AI Gateway**:
  - `AI_GATEWAY_API_KEY`
  - optional overrides:
    - `AI_GATEWAY_BASE_URL`
    - `AI_GATEWAY_CHAT_MODEL`
    - `AI_GATEWAY_EMBEDDING_MODEL`
- **Blob**:
  - `BLOB_READ_WRITE_TOKEN`
- **Upstash Vector**:
  - `UPSTASH_VECTOR_REST_URL`
  - `UPSTASH_VECTOR_REST_TOKEN`
- **Upstash Redis** (optional but strongly recommended for cost control):
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- **Upstash QStash** (required for async ingestion and background jobs):
  - publish:
    - `QSTASH_TOKEN`
  - verify (inbound webhooks):
    - `QSTASH_CURRENT_SIGNING_KEY`
    - `QSTASH_NEXT_SIGNING_KEY`

**Workflow note:** Vercel Workflow DevKit requires no additional application env vars for the core “start a run and stream it” path when running on Vercel. However, if you use local Workflow observability tooling (`npx workflow web`) or non-Vercel “world” backends, additional `WORKFLOW_*` env vars may apply; those are **not** part of this app’s required env contract ([Workflow DevKit Next.js getting started](https://useworkflow.dev/docs/getting-started/next)).

### CLI playbooks (verifiable commands)

These command families are the supported operational workflows for provisioning
and inspecting resources during implementation and runbooks.

#### Vercel CLI

Vercel CLI is the primary way to align local `.env.local` with a linked Vercel project:

- Link the repo to a Vercel project:
  - `vercel link`
- Pull development env vars into `.env.local`:
  - `vercel env pull`
- Manage env vars:
  - `vercel env add`
  - `vercel env update`
  - `vercel env remove`
  - `vercel env list`

Reference: `vercel env --help`

#### Neon CLI

Neon CLI supports scripting and CI/CD:

- Authenticate:
  - `neon auth`
  - or via `NEON_API_KEY` for non-interactive usage
- Projects:
  - `neon projects list`
  - `neon projects create`
  - `neon projects get <id>`
- Branches:
  - `neon branches list --project-id <id>`
  - `neon branches create --project-id <id>`
- Connection strings:
  - `neon connection-string --project-id <id> --pooled --ssl require`

Notes:

- Official docs commonly refer to this CLI as `neonctl`; in this repo’s dev
  environment it is installed as `neon`.
- Do not paste API keys into artifacts or logs.

References:

- [Neon CLI reference](https://neon.com/docs/reference/neon-cli)

#### Drizzle / drizzle-kit

Use Bun scripts (repo standard):

- Generate migrations:
  - `bun run db:generate`
- Apply migrations:
  - `bun run db:migrate`
- Drizzle Studio:
  - `bun run db:studio`

Direct CLI reference:

- `bunx drizzle-kit --help`

## Model Access: AI Gateway Defaults (Final Decision)

Per ADR-0007, all model access is through AI Gateway. This spec sets the final default model IDs:

- Default chat model: `xai/grok-4.1-fast-reasoning` ([AI Gateway model: grok-4.1-fast-reasoning](https://vercel.com/ai-gateway/models/grok-4.1-fast-reasoning))
- Default embedding model: `alibaba/qwen3-embedding-4b` ([AI Gateway model: qwen3-embedding-4b](https://vercel.com/ai-gateway/models/qwen3-embedding-4b))

Verification command (do not hardcode based on memory; confirm at implementation time):

```bash
curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '[.data[] | select(.id | startswith("xai/")) | .id] | sort | .[]'
```

Embedding model verification command:

```bash
curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '[.data[] | select(.id | startswith("alibaba/")) | .id] | sort | .[]'
```

## API Contracts (Current + Required Additions)

This section documents the current API surface (repo truth) and the required
additions to complete the UI.

### Uploads: `POST /api/upload` (implemented)

Request: `multipart/form-data`

- `projectId`: string (required)
- `file`: File (one or many; required)
- `async`: `"true"` or `"false"` (optional; when `true`, try QStash and fall back to inline locally)

Response:

- `{ files: ProjectFileDto[] }` (with optional `ingest.chunksIndexed` when inline ingestion runs)

Code: `src/app/api/upload/route.ts`

### Search: `GET /api/search` (implemented)

Query params:

- `q`: string (required)
- `projectId`: string (optional)
- `scope`: `global | project` (optional)
- `types`: `projects|uploads|chunks|artifacts|runs` (optional, delimited by `,` or `|`)
- `limit`: number (optional, bounded)
- `cursor`: string (optional; accepted for forward-compatible pagination)

Code: `src/app/api/search/route.ts`

### Runs: `POST /api/runs` (implemented)

Body (JSON):

- `projectId`: string
- `kind`: `"research"` | `"implementation"`
- `metadata`: object (optional)

Code: `src/app/api/runs/route.ts`

### Durable workers (implemented)

- `POST /api/jobs/ingest-file`
  - QStash-signed ingestion worker (async ingestion)

### Runs: stream + cancel (implemented)

- `GET /api/runs/[runId]/stream?startIndex=N`
  - Resumable run stream backed by Workflow DevKit.
- `POST /api/runs/[runId]/cancel`
  - Cancels an in-flight run and updates persisted status.

### Chat: multi-turn session (implemented)

Implemented to support the AI Elements chat UI:

- **Session start**: `POST /api/chat`
  - Starts a **workflow run** and returns a resumable UI message stream.
  - Must include `x-workflow-run-id` response header for reconnection/follow-ups ([Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams)).
- **Follow-ups**: `POST /api/chat/[runId]`
  - Resumes a workflow hook to inject a new user message into the **same** workflow run ([Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling)).
- **Stream reconnection**: `GET /api/chat/[runId]/stream?startIndex=N`
  - Uses `getRun(runId)` and `run.getReadable({ startIndex })` to resume exactly from the last received chunk index ([Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams)).

Implementation locations:

- Route handlers:
  - `src/app/api/chat/route.ts`
  - `src/app/api/chat/[runId]/route.ts`
  - `src/app/api/chat/[runId]/stream/route.ts`
- Workflow:
  - `src/workflows/chat/project-chat.workflow.ts` (`DurableAgent`, hooks, resumable stream markers)
  - `src/workflows/chat/hooks/chat-message.ts`
  - `src/workflows/chat/steps/writer.step.ts`
  - `src/workflows/chat/steps/retrieve-project-chunks.step.ts`
  - `src/workflows/chat/tools.ts`
- Model selection via env (see env contract in `src/lib/env.ts`):
  - `AI_GATEWAY_CHAT_MODEL` (default: `xai/grok-4.1-fast-reasoning`)

ADR sources:

- [AI SDK ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- [Streaming UI responses](https://ai-sdk.dev/docs/reference/ai-sdk-core/create-agent-ui-stream-response)

## UI/UX Finalization (AI Elements + shadcn/ui)

This app’s UI must make all major capabilities discoverable and fast:

- Project workspace with deep-linkable tabs:
  - Overview
  - Uploads
  - Chat
  - Runs
  - Search
  - Settings (budgets / integrations status)

### UI principles (non-negotiable)

- Default to Server Components for data reads; use Client Components only for interactive surfaces.
- Avoid waterfalls: start independent server work early, `Promise.all` where safe.
- Memoization follows `$vercel-react-best-practices`: use `useMemo`/`useCallback` only for genuinely expensive work or to prevent costly re-renders (`rerender-memo`), and avoid memo for cheap primitives (`rerender-simple-expression-in-memo`).
- No barrel files / no new barrel imports.
- Use `next/image` for rendered images (configure external domains via `images.remotePatterns`; use `unoptimized` for blob/data URLs when needed). [Next.js Image component](https://nextjs.org/docs/app/api-reference/components/image).
- Lazy-load heavy client renderers with `next/dynamic` to reduce initial bundle size. [Next.js lazy loading](https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading).

### AI Elements usage

AI Elements must be used as the primary primitive set for:

- chat message rendering (assistant/user/tool parts)
- streaming markdown rendering (via Streamdown where appropriate)
- workflow/run visualization and step timelines (use the AI Elements workflow example as baseline)

Source index (AI Elements docs): [AI Elements docs](https://elements.ai-sdk.dev/llms.txt)

### AI Elements component set (required)

When implementing the UI in Phase 1–3, vendor these AI Elements components
(names are from AI Elements docs; install via the AI Elements CLI):

- Chat:
  - `Conversation`
  - `Message` (and subcomponents like `MessageContent`, `MessageResponse`)
  - `PromptInput` (composer)
  - `Reasoning`
  - `Sources`
- Runs (workflow visualization):
  - `Canvas` (React Flow-based)
  - `Node`
  - `Edge`
  - `Controls`
  - `Connection`

Reference: AI Elements workflow example: [AI Elements workflow example](https://ai-sdk.dev/elements/examples/workflow)

- [AI Elements workflow example](https://elements.ai-sdk.dev/examples/workflow)

## Next.js Cache Components (Partial Prerendering)

Enable Cache Components and adopt `'use cache'` for deterministic server loaders, while keeping request-scoped UI dynamic sections under Suspense boundaries.

Local Next.js docs index for this repo: `./.next-docs` (see `AGENTS.md`).

## Testing Requirements (Minimum “Final” Bar)

### Integration tests

- DB integration test (already present):
  - Runs only when `DATABASE_URL` is set.
  - Applies migrations and performs CRUD.
- QStash signature verification contract tests:
  - Unsigned requests must be rejected with 401/403.
- Workflow chat contract tests:
  - Starting a chat returns `x-workflow-run-id`.
  - Reconnect endpoint honors `startIndex` (no duplicated chunks on resume).
- Ingestion integration test:
  - Given a small text fixture, extraction → chunking → embedding (mock) → vector upsert (mock) persists expected DB state.

### Unit tests

- Chunking determinism and stable chunk IDs.
- Budget enforcement for retrieval top-k, embedding batch size, upload limits.

### Build gates

- `bun run ci` must pass.

## Implementation Plan (Decision-Complete)

This plan enumerates all remaining work to reach “finalized” status. It is written so implementation requires no further decisions.

### Phase 0 — Documentation alignment (this change set)

- Add this spec (SPEC-0021) and update existing ADRs/SPECs to match repo paths (`*.server.ts`), and to reference SPEC-0021 where it becomes the integrator spec.

### Phase 1 — UI + AI Elements foundation

1. Install and initialize shadcn/ui with Tailwind v4, using Bun. (**done**)
2. Vendor AI Elements components into `src/components/ai-elements/**` using `ai-elements` CLI. (**done**)
3. Implement workspace pages under `src/app/(app)/projects/**`:
   - `src/app/(app)/projects/page.tsx` (project list)
   - `src/app/(app)/projects/[projectId]/layout.tsx` (tabs)
   - `src/app/(app)/projects/[projectId]/uploads/page.tsx`
   - `src/app/(app)/projects/[projectId]/chat/page.tsx`
   - `src/app/(app)/projects/[projectId]/runs/page.tsx`
   - `src/app/(app)/projects/[projectId]/search/page.tsx`
4. Implement a minimal settings surface for budgets and integrations status.

### Phase 2 — Chat Route Handler + ToolLoopAgent wiring

1. Integrate Vercel Workflow DevKit (**done**):
   - Wrap `next.config.ts` with `withWorkflow(...)` ([Workflow DevKit Next.js getting started](https://useworkflow.dev/docs/getting-started/next)).
   - Ensure `src/proxy.ts` matcher excludes `.well-known/workflow/` routes ([Workflow DevKit Next.js getting started](https://useworkflow.dev/docs/getting-started/next)).
2. Add multi-turn chat session endpoints (**done**):
   - `POST /api/chat` (start workflow + stream + `x-workflow-run-id`) ([Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling))
   - `POST /api/chat/[runId]` (resume hook for follow-ups) ([Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling))
   - `GET /api/chat/[runId]/stream?startIndex=` (resume stream) ([Resumable streams](https://useworkflow.dev/docs/ai/resumable-streams))
3. Implement workflow (**done**):
   - `src/workflows/chat/*` (multi-turn loop; user-message stream markers; hook definition) ([Chat session modeling](https://useworkflow.dev/docs/ai/chat-session-modeling)).
4. Replace client chat transport with `WorkflowChatTransport` (no `useMemo`/`useCallback`; use `useEffect` + inline functions) ([WorkflowChatTransport](https://useworkflow.dev/docs/api-reference/workflow-ai/workflow-chat-transport)).
5. Add message persistence to DB (thread + messages tables) or explicitly document the deferred plan if schema is not yet present.

### Phase 3 — Runs engine (real graph) + workflow UI

1. Implement durable runs on Workflow DevKit (`src/workflows/runs/**`) aligned with SPEC-0005.
2. Ensure each step is idempotent and persisted in DB (`runs` + `run_steps`).
3. Add UI to display run timelines and stream events with resumable `startIndex`.

### Phase 4 — Cache Components enablement

1. Update `next.config.ts` to enable `cacheComponents: true`. (**done**)
2. Refactor stable server loaders to `'use cache'` and tag invalidation on write paths. (**done**)

### Phase 5 — Test coverage completion

1. Add integration tests for ingestion + QStash signature verification. (**done** for route-level coverage)
2. Add contract tests for `/api/upload`, `/api/search`, `/api/runs` validation and auth. (**done** for `/api/upload` and `/api/search`; `/api/runs` already present)
3. Ensure the “env var contract” is updated when defaults change:
   - `src/lib/env.ts`
   - `.env.example`
   - [docs/ops/env.md](/docs/ops/env.md)
   - `src/lib/env.test.ts`

## References

- [Vercel Fluid Compute](https://vercel.com/docs/fluid-compute)
- [attachDatabasePool](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)
- [Neon on Vercel connection methods](https://neon.com/docs/guides/vercel-connection-methods)
- [Neon + Drizzle guide](https://neon.com/docs/guides/drizzle)
- [Upstash Vector hybrid indexes](https://upstash.com/docs/vector/features/hybridindexes)
- [QStash Next.js quickstart](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs)
- [AI Gateway models endpoint](https://ai-gateway.vercel.sh/v1/models)
- [AI Elements docs index](https://elements.ai-sdk.dev/llms.txt)

## Changelog

- **0.1.0 (2026-02-03)**: Initial full-stack finalization spec (documents current repo snapshot + decision-complete remaining work).
- **0.1.1 (2026-02-03)**: Updated repo snapshot to reflect vendored AI Elements/shadcn/ui and implemented Workflow DevKit chat endpoints/workflows.
- **0.1.2 (2026-02-06)**: Implemented Cache Components, `'use cache'` read-path migration with tag invalidation, global search page, shared search UI, and expanded `/api/search` contract.
- **0.1.3 (2026-02-06)**: Implemented ownership-scoped project access (`projects.owner_user_id`), Zod-hardened `/api/search`, Upstash rate limiting for search, and docs/ADR alignment.
- **0.1.4 (2026-02-06)**: Hardened async ingestion by validating trusted Blob URL host/protocol/path in `POST /api/jobs/ingest-file` before fetch.
