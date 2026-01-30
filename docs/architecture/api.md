# API Surface (Route Handlers)

The system uses Next.js Route Handlers under `src/app/api/*`.

Chat and agent output are streamed using AI SDK v6 streaming helpers.
([createAgentUIStreamResponse](https://ai-sdk.dev/docs/reference/ai-sdk-core/create-agent-ui-stream-response))

## Auth

- `GET /login`
- `POST /api/auth/login` (rate-limited)
- `POST /api/auth/logout`

## Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId` (hard delete + cleanup)

## Upload & ingestion

- `POST /api/upload`
  - stores original in Vercel Blob ([Vercel Blob](https://vercel.com/docs/vercel-blob))
  - extracts text
  - chunks
  - embeds via AI Gateway
  - indexes in Upstash Vector

## Chat

- `POST /api/chat`
  - input: `projectId`, `threadId?`, `agentMode`, `message`, `model`
  - output: streaming UI message parts

## Runs (durable workflows)

- `POST /api/runs` (creates run + enqueues workflow via QStash)
- `GET /api/runs/:runId`
- `POST /api/jobs/run-step` (QStash secured step execution)

Reference: [QStash Next.js Quickstart](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs).

## Export

- `GET /api/export/:projectId` (deterministic zip)
