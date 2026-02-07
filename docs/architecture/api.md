# API Surface (Route Handlers)

The system uses Next.js Route Handlers under `src/app/api/*` as the public HTTP
API. Server Actions exist, but are invoked only from the authenticated UI and
are not treated as stable public HTTP endpoints.

Unless explicitly documented, endpoints require an authenticated app user via
`requireAppUserApi()` and return JSON errors via `jsonError()`.

## Auth

- Neon Auth UI routes:
  - `GET /auth/*`
  - `GET /account/*`
- Neon Auth API proxy:
  - `GET|POST|PUT|PATCH|DELETE /api/auth/*`

See:

- [SPEC-0002](./spec/SPEC-0002-authentication-access-control.md)

## Upload & ingestion (background jobs via QStash)

- `POST /api/upload`
  - stores originals in Vercel Blob
  - writes metadata in Neon Postgres
  - may enqueue async ingestion jobs via Upstash QStash (`async=true`)
- `POST /api/jobs/ingest-file` (QStash-signed)
  - executes extract → chunk → embed → index asynchronously
  - validates `storageKey` is an HTTPS Vercel Blob URL under
    `/projects/:projectId/uploads/*` before fetching

See:

- [SPEC-0003](./spec/SPEC-0003-upload-ingestion-pipeline.md)
- [ADR-0005](./adr/ADR-0005-orchestration-upstash-qstash-for-durable-workflows.md)

## Search

- `GET /api/search`
  - Query params:
    - required: `q` (2-256 chars)
    - optional: `projectId`, `scope=global|project`, `types`, `limit`
    - `types` supports: `projects|uploads|chunks|artifacts|runs`
    - `limit` max: `20`
  - Scope behavior:
    - default scope is `project` when `projectId` is present
    - default scope is `global` when `projectId` is absent
  - Authorization/scoping:
    - global scope is ownership-filtered (`projects.owner_user_id = current user`)
    - project scope requires project ownership
  - Rate limiting:
    - server-side user/IP keyed limit (429 + `Retry-After`, `X-RateLimit-*` headers)
  - Returns merged, ranked results with deep links for:
    - projects
    - uploads
    - chunks
    - artifacts
    - runs

See:

- [SPEC-0020](./spec/SPEC-0020-project-workspace-and-search.md)
- [SPEC-0021](./spec/SPEC-0021-full-stack-finalization-fluid-compute-neon-upstash-ai-elements.md)
- [SPEC-0025](./spec/SPEC-0025-cache-components-search-authorization-finalization.md)
- [ADR-0013](./adr/ADR-0013-caching-cost-controls-next-js-caching-upstash-redis-budgets.md)

## Export (deterministic artifacts ZIP)

- `GET /api/export/:projectId`
  - Streams a deterministic ZIP of the latest artifact versions plus citations.
  - Includes `manifest.json` inside the ZIP for integrity and provenance.

See:

- [SPEC-0008](./spec/SPEC-0008-artifact-generation-versioning-and-export-zip.md)

## Chat (durable session, Workflow DevKit)

Chat sessions are durable workflow runs. The API uses AI SDK UI message streams
and supports stream resumption via a `startIndex` cursor.

- `POST /api/chat`
  - body: `{ projectId: string, messages: UIMessage[] }`
  - response:
    - streaming UI message event stream
    - header `x-workflow-run-id` (the durable run ID used to resume the stream)
- `POST /api/chat/:runId`
  - body: `{ message: string }` (inject a follow-up message into the in-flight session)
  - response: `{ ok: true }`
- `POST /api/chat/:runId/cancel`
  - cancels the workflow run and marks the persisted chat thread as `canceled`
- `GET /api/chat/:runId/stream?startIndex=N`
  - resumes an existing stream; rejects invalid `startIndex`

See:

- [SPEC-0022](./spec/SPEC-0022-vercel-workflow-durable-runs-and-streaming-contracts.md)
- [ADR-0026](./adr/ADR-0026-orchestration-vercel-workflow-devkit-for-interactive-runs.md)

## Runs (durable workflows, Workflow DevKit)

Runs are durable workflows backed by Workflow DevKit. Streaming is resumable
using `startIndex` and cancellation is persisted as `canceled` (not `failed`).

- `POST /api/runs`
  - body: `{ projectId: string, kind: "research" | "implementation", metadata?: Record<string, unknown> }`
  - response: JSON run payload + header `x-workflow-run-id`
- `GET /api/runs/:runId/stream?startIndex=N`
  - resumes an existing run stream; rejects invalid `startIndex`
- `POST /api/runs/:runId/cancel`
  - cancels the workflow run and marks persisted run/steps as `canceled`

See:

- [SPEC-0005](./spec/SPEC-0005-durable-runs-orchestration.md)
- [SPEC-0024](./spec/SPEC-0024-run-cancellation-and-stream-resilience.md)
- [ADR-0026](./adr/ADR-0026-orchestration-vercel-workflow-devkit-for-interactive-runs.md)

## Planned (Not Implemented)

The following endpoints are **spec’d** but not implemented as Route Handlers in
this repository snapshot:

- Project CRUD endpoints under `/api/projects/*` (projects exist via DAL + server actions)
- Artifacts listing / regeneration
- RepoOps endpoints (connect/create/index)
- Approvals endpoints
- Provisioning + deployment automation endpoints
- Webhook endpoints (GitHub/Vercel)
- Sandbox job runner endpoints

Refer to the SPEC/ADR documents for the intended design and implementation
order:

- [Implementation order](./implementation-order.md)
- [Specs index](./spec/index.md)
- [ADRs index](./adr/index.md)
