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

## Repository alignment (current)

- The Next.js app lives under `src/app`.
- TypeScript path alias: `@/*` maps to `src/*`.
- Bun is the only supported toolchain locally and in CI; Vercel Functions are
  configured for Bun runtime via `vercel.json` (`bunVersion: "1.x"`).

See [repository baseline](./repository-baseline.md).

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
- **Authentication:** Neon Auth + allowlist access control.
  (See [ADR-0022](./adr/ADR-0022-authentication-neon-auth-oauth-allowlist.md) and
  [SPEC-0002](./spec/SPEC-0002-authentication-access-control.md).)
- **Durable workflows:** Upstash QStash with signature verification.
  ([QStash Next.js quickstart](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs))
- **Vector retrieval:** Upstash Vector.
  ([Upstash Vector + AI SDK](https://upstash.com/docs/vector/integrations/ai-sdk))
- **DB:** Neon Postgres + Drizzle ORM.
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
