# Architecture Overview

## Executive summary

ai-agent-builder is a single-user, production-grade multi-agent system that
transforms unstructured product ideas (docs, decks, spreadsheets) into a complete
implementation-ready documentation pack (PRD, specs, ADRs, security, roadmap,
Codex prompts).

## System context

```mermaid
flowchart LR
  U[User]
  UI[Next.js UI<br/>AI Elements + shadcn]
  API[Route Handlers<br/>chat/upload/runs]
  DB[(Neon Postgres)]
  BLOB[(Vercel Blob)]
  REDIS[(Upstash Redis + Ratelimit)]
  VECTOR[(Upstash Vector)]
  QSTASH[(Upstash QStash)]
  AIGW[Vercel AI Gateway]
  EXA[Exa]
  FIRE[Firecrawl]
  MCP[MCP tools (Context7)]
  SBX[Vercel Sandbox]

  U --> UI --> API
  API --> DB
  API --> BLOB
  API --> REDIS
  API --> VECTOR
  API --> QSTASH
  API --> AIGW
  API --> EXA
  API --> FIRE
  API --> MCP
  API --> SBX
```

## Repository alignment (current)

- The Next.js app lives under `src/app`.
- TypeScript path alias: `@/*` maps to `src/*`.
- Drizzle is configured for `src/db/schema.ts` and `src/db/migrations`.
- Bun is the only supported toolchain locally and in CI; Vercel Functions are
  configured for Bun runtime via `vercel.json` (`bunVersion: "1.x"`).

See `docs/architecture/repository-baseline.md`.

## Key choices (and sources)

- **Runtime/toolchain:** Bun for installs and scripts; Bun runtime on Vercel.
  ([Vercel Bun runtime](https://vercel.com/docs/functions/runtimes/bun))
- **Agents:** AI SDK v6 `ToolLoopAgent` and streaming responses via
  `createAgentUIStreamResponse`.
  ([ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent),
  [createAgentUIStreamResponse](https://ai-sdk.dev/docs/reference/ai-sdk-core/create-agent-ui-stream-response))
- **Dynamic tools:** runtime tool injection via `dynamicTool()`.
  ([dynamicTool()](https://ai-sdk.dev/docs/reference/ai-sdk-core/dynamic-tool))
- **Model routing:** Vercel AI Gateway exclusively.
  ([AI Gateway](https://vercel.com/docs/ai-gateway))
- **Durable workflows:** Upstash QStash with signature verification.
  ([QStash Next.js quickstart](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs))
- **Vector retrieval:** Upstash Vector.
  ([Upstash Vector + AI SDK](https://upstash.com/docs/vector/integrations/ai-sdk))
- **DB:** Neon Postgres + Drizzle ORM.
  ([Neon serverless driver](https://neon.com/docs/serverless/serverless-driver))
- **Sandbox execution:** Vercel Sandbox for “Code Mode”.
  ([Vercel Sandbox](https://vercel.com/docs/vercel-sandbox))

## Core invariants

- Server-only tool execution; UI never receives provider keys.
- Every externally sourced factual claim must include a citation.
- Runs are durable and step-idempotent.
- Export outputs are deterministic.
- Bun-only scripts: CI and local commands must match.

## Document map

- ADRs: `docs/architecture/adr/`
- Specs: `docs/architecture/spec/`
- Security: `docs/architecture/security.md`
- Operations: `docs/architecture/operations.md`
- Runbook: `docs/architecture/runbook.md`
