# API Surface (Route Handlers)

The system uses Next.js Route Handlers under `src/app/api/*` as the public HTTP
API, plus Server Actions — invoked only from the authenticated UI, not exposed
as public HTTP endpoints.

Chat and agent output are streamed using AI SDK v6 streaming helpers:

- [createAgentUIStreamResponse](https://ai-sdk.dev/docs/reference/ai-sdk-core/create-agent-ui-stream-response)

## Auth

- Neon Auth UI routes:
  - `GET /auth/*`
  - `GET /account/*`
- Neon Auth API proxy:
  - `GET|POST|PUT|PATCH|DELETE /api/auth/*`

See:

- [SPEC-0002](./spec/SPEC-0002-authentication-access-control.md)

## Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId` (hard delete + cleanup)

## Upload & ingestion

- `POST /api/upload`
  - stores original in Vercel Blob ([Vercel Blob](https://vercel.com/docs/vercel-blob))
  - processes independent files in parallel; when `async=true`, enqueues
    QStash ingestion jobs with per-file labels/dedup ids
  - extracts text (PDF/DOCX/PPTX/XLSX/TXT/MD)
  - chunks
  - embeds via AI Gateway
  - indexes in Upstash Vector

- `POST /api/jobs/ingest-file` (QStash-secured)
  - runs extraction/chunking/embedding/indexing asynchronously

## Chat

- `POST /api/chat`
  - input: `projectId`, `threadId?`, `agentMode`, `message`, `model`
  - output: streaming UI message parts

## Search

- `GET /api/search?q=...&projectId=... (optional)&types=...`
  - merges DB metadata matches and vector-based content matches
  - supports deep links to artifacts/files/run steps/repo paths

## Artifacts

- `GET /api/projects/:projectId/artifacts`
- `GET /api/projects/:projectId/artifacts/:artifactId`
- `POST /api/projects/:projectId/artifacts/:artifactId/regenerate`

## Runs (durable workflows)

Runs are durable workflows backed by Workflow DevKit (durable runs + streaming).

- `POST /api/runs`
  - creates run row in Neon
  - starts a Workflow DevKit run
  - returns `x-workflow-run-id` header
- `GET /api/runs/:runId/stream?startIndex=...`
  - reconnect/resume to an existing run stream
- `POST /api/runs/:runId/cancel`
  - cancels the workflow run and marks persisted run/steps as canceled

## Export

- `POST /api/projects/:projectId/export`
  - produces deterministic zip of latest artifacts + citations + manifests
  - stores zip in blob and returns download URL

## Implementation: RepoOps

- `POST /api/projects/:projectId/repo/connect`
  - connect an existing GitHub repo
- `POST /api/projects/:projectId/repo/create`
  - create a new GitHub repo and connect it
- `POST /api/projects/:projectId/repo/index`
  - triggers repo indexing job and writes to a vector namespace
- `GET /api/projects/:projectId/repo`
  - returns repo connection status + metadata

## Implementation: Approvals

- `GET /api/runs/:runId/approvals`
- `POST /api/runs/:runId/approvals/:approvalId/approve`
- `POST /api/runs/:runId/approvals/:approvalId/reject`

Approvals unblock approval-gated steps (push/merge/provision/deploy).

## Implementation: Provisioning and deployments

- `POST /api/projects/:projectId/provision`
  - triggers infra provisioning step(s) (approval-gated)
- `POST /api/projects/:projectId/deploy`
  - triggers deployment step(s) (approval-gated)

## Webhooks (optional)

Webhooks reduce polling and improve responsiveness.

- `POST /api/webhooks/github`
  - PR status updates, check completion, etc.
- `POST /api/webhooks/vercel`
  - deployment status updates

All webhook endpoints must verify signatures and be idempotent.

## Sandbox execution

- `POST /api/sandbox/jobs`
  - starts a sandbox job (Code Mode and implementation verification)
  - streams logs or provides polling handles
