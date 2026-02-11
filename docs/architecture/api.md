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
  - Vercel Blob client upload token exchange (`@vercel/blob/client upload()` `handleUploadUrl`)
  - issues scoped client tokens after authenticating and authorizing the project
- `POST /api/upload/register`
  - registers already-uploaded blobs for a project
  - writes metadata in Neon Postgres (idempotent by sha256)
  - ingests inline by default; may enqueue async ingestion jobs via Upstash QStash (`async=true`)
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
    - server-side user keyed limit (429 + `Retry-After`, `X-RateLimit-*` headers)
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

## Code Mode (sandbox-backed, Workflow DevKit)

Code Mode is a user-invoked durable workflow that runs allowlisted commands in
Vercel Sandbox. It uses AI SDK UI message streams and supports stream resumption
via a `startIndex` cursor.

- `POST /api/code-mode`
  - body: `{ projectId: string, prompt: string, network?: "none" | "restricted", budgets?: { maxSteps?: number, timeoutMs?: number } }`
  - response: JSON `{ runId, workflowRunId }` + header `x-workflow-run-id`
- `GET /api/code-mode/:runId/stream?startIndex=N`
  - resumes an existing stream; rejects invalid `startIndex`
- `POST /api/code-mode/:runId/cancel`
  - cancels the workflow run and marks persisted run/steps as `canceled`

See:

- [SPEC-0009](./spec/SPEC-0009-sandbox-code-mode.md)
- [ADR-0010](./adr/ADR-0010-safe-execution-vercel-sandbox-bash-tool-code-execution-ctx-zip.md)

## RepoOps (target repo connections)

- `GET /api/repos?projectId=...`
  - lists connected repos for a project
- `POST /api/repos`
  - body: `{ projectId, provider: "github", owner, name, cloneUrl?, htmlUrl?, defaultBranch? }`
  - connects a repo (metadata only). When GitHub credentials are configured, the
    server will fetch missing repo metadata automatically.

See:

- [SPEC-0017](./spec/SPEC-0017-repo-ops-and-github-integration.md)
- [ADR-0024](./adr/ADR-0024-gitops-repository-automation-pr-based-workflows.md)

## Approvals (side-effectful gates)

Approvals are explicit user actions that unblock durable workflows.

- `GET /api/approvals?projectId=...&runId=...&limit=...`
  - lists pending approvals (optionally filtered by run)
- `POST /api/approvals`
  - body: `{ approvalId: string }`
  - approves the request and best-effort resumes the workflow hook

See:

- [SPEC-0016](./spec/SPEC-0016-implementation-runs-end-to-end-build-and-deploy.md)
- [ADR-0024](./adr/ADR-0024-gitops-repository-automation-pr-based-workflows.md)

## Deployments (records + status)

- `GET /api/deployments?projectId=...&runId=...&limit=...`
  - lists deployments for a project (optionally filtered by run)
- `POST /api/deployments`
  - creates a deployment record (non-secret metadata only)

See:

- [SPEC-0018](./spec/SPEC-0018-infrastructure-provisioning-and-secrets-for-target-apps.md)
- [ADR-0025](./adr/ADR-0025-infrastructure-provisioning-and-vercel-deployment-automation.md)

## Webhooks (external status ingestion)

Webhook endpoints do not use `requireAppUserApi()`. They are safe-by-default and
return 501 when secrets are not configured.

- `POST /api/webhooks/github`
  - verifies `x-hub-signature-256` using `GITHUB_WEBHOOK_SECRET`
- `POST /api/webhooks/vercel`
  - verifies `x-vercel-signature` using `VERCEL_WEBHOOK_SECRET`
  - persists non-secret deployment status updates when a matching deployment
    record exists

## Planned (Not Implemented)

The following endpoints are **spec’d** but not implemented as Route Handlers in
this repository snapshot:

- Project CRUD endpoints under `/api/projects/*` (projects exist via DAL + server actions)
- Artifacts listing / regeneration
- Provisioning automation endpoints (provider-specific admin APIs; workflow-driven today)
- Sandbox job runner endpoints (the sandbox runner is internal today)

Refer to the SPEC/ADR documents for the intended design and implementation
order:

- [Implementation order](./implementation-order.md)
- [Specs index](./spec/index.md)
- [ADRs index](./adr/index.md)
