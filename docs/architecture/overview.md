# Architecture Overview

## Executive summary

ai-agent-builder is a single-user, production-grade multi-agent system with two
phases:

1. **Research → Spec Generation**
   - transforms unstructured product inputs (docs, decks, spreadsheets) into a
     complete, implementation-ready documentation pack (PRD, specs, ADRs,
     security, roadmap, prompts)
2. **Implementation → Deployment**
   - after human review, executes a durable, approval-gated workflow that
     implements those plans into a real codebase (PR-based GitOps), runs
     verification in sandboxed compute, provisions/connects infrastructure, and
     deploys to production.

## System context

```mermaid
flowchart LR
  U[User]
  UI[Next.js UI<br/>AI Elements + shadcn]
  API[Route Handlers + Server Actions<br/>chat/upload/runs/implementation]
  DB[(Neon Postgres)]
  BLOB[(Vercel Blob)]
  REDIS[(Upstash Redis + Ratelimit)]
  VECTOR[(Upstash Vector)]
  WF[(Vercel Workflow DevKit)]
  QSTASH[(Upstash QStash)]
  AIGW[Vercel AI Gateway]
  EXA[Exa]
  FIRE[Firecrawl]
  MCP[MCP tools (Context7)]
  SBX[Vercel Sandbox]
  GH[GitHub]
  VERCEL[Vercel Platform]
  NEONAPI[Neon API]
  UPAPI[Upstash Developer API<br/>(optional)]

  U --> UI --> API
  API --> DB
  API --> BLOB
  API --> REDIS
  API --> VECTOR
  API --> WF
  API --> QSTASH
  API --> AIGW
  API --> EXA
  API --> FIRE
  API --> MCP
  API --> SBX
  API --> GH
  API --> VERCEL
  API --> NEONAPI
  API --> UPAPI
```

Notes:

- Some integrations in the diagram are **feature-gated** (env-dependent) and
  safe-by-default: when credentials are missing, the app disables automated
  paths and generates deterministic manual fallback steps instead (see
  `docs/ops/env.md`).

## Repository alignment (current)

- The Next.js app lives under `src/app`.
- TypeScript path alias: `@/*` maps to `src/*`.
- Bun is the only supported toolchain locally and in CI; Vercel Functions are
  configured for Bun runtime via `vercel.json` (`bunVersion: "1.x"`).

See [repository baseline](./repository-baseline.md).

## Key choices (and sources)

- **Runtime/toolchain:** Bun for installs and scripts; Bun runtime on Vercel.
  ([Vercel Bun runtime](https://vercel.com/docs/functions/runtimes/bun))
- **Agents:** AI SDK v6 + Workflow DevKit `DurableAgent`, streaming responses via
  AI SDK UI message streams (`createUIMessageStreamResponse`).
  ([AI SDK agents](https://ai-sdk.dev/docs/agents/overview),
  [createUIMessageStreamResponse](https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream-response),
  [Workflow DevKit: DurableAgent](https://useworkflow.dev/docs/api-reference/workflow-ai/durable-agent))
- **Dynamic tools:** runtime tool injection via `dynamicTool()`.
  ([dynamicTool()](https://ai-sdk.dev/docs/reference/ai-sdk-core/dynamic-tool))
- **Model routing:** Vercel AI Gateway exclusively.
  ([AI Gateway](https://vercel.com/docs/ai-gateway))
- **Authentication:** Neon Auth + allowlist access control.
  (See [ADR-0022](./adr/ADR-0022-authentication-neon-auth-oauth-allowlist.md) and
  [SPEC-0002](./spec/SPEC-0002-authentication-access-control.md).)
- **Interactive orchestration:** Vercel Workflow DevKit (durable runs + resumable streams).
  (See [ADR-0026](./adr/ADR-0026-orchestration-vercel-workflow-devkit-for-interactive-runs.md).)
- **Background jobs:** Upstash QStash with signature verification (ingestion + fanout).
  (See [ADR-0005](./adr/ADR-0005-orchestration-upstash-qstash-for-durable-workflows.md).)
- **Vector retrieval:** Upstash Vector.
  ([Upstash Vector + AI SDK](https://upstash.com/docs/vector/integrations/ai-sdk))
- **DB:** Neon Postgres + Drizzle ORM.
  - On Vercel **Fluid compute**, use Postgres TCP + connection pooling.
    ([Neon: Connecting to Neon from Vercel](https://neon.com/docs/guides/vercel-connection-methods),
    [`attachDatabasePool`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package))
  - In classic serverless environments without safe pooling, Neon’s HTTP/WebSocket
    serverless driver can be used instead.
    ([Neon serverless driver](https://neon.com/docs/serverless/serverless-driver))
- **Safe execution and verification:** Vercel Sandbox for “Code Mode” and
  implementation verification jobs.
  ([Vercel Sandbox](https://vercel.com/docs/vercel-sandbox))
- **GitOps:** PR-based workflows in GitHub.
  (See [ADR-0024](./adr/ADR-0024-gitops-repository-automation-pr-based-workflows.md).)
- **Provisioning and deployment automation:** Vercel REST API / SDK, with manual
  fallback and optional Neon/Upstash provisioning.
  (See [ADR-0025](./adr/ADR-0025-infrastructure-provisioning-and-vercel-deployment-automation.md).)

## Core invariants

- Server-only tool execution; UI never receives provider keys.
- Every externally sourced factual claim must include a citation.
- Runs are durable and step-idempotent.
- Export outputs are deterministic.
- Bun-only scripts: CI and local commands must match.
- Side-effectful actions are approval-gated and logged (repo merges, provisioning,
  production deploys).

## Document map

- ADRs: [index](./adr/index.md)
- Specs: [index](./spec/index.md)
- Security: [docs/architecture/security.md](./security.md)
- Operations: [docs/architecture/operations.md](./operations.md)
- Runbook: [docs/architecture/runbook.md](./runbook.md)
- Implementation build plan: [docs/architecture/implementation-order.md](./implementation-order.md)
- Env setup: [docs/ops/env.md](../ops/env.md)
