# ai-agent-builder — Documentation

This `docs/` directory is the authoritative architecture + requirements
reference for implementing **ai-agent-builder**.

Product requirements live at the repo root in `PRD.md`.

It is written to be consumed by:

- humans (you)
- AI coding agents (Codex TUI running gpt-5.2-high)

## Repository baseline (bootstrapped)

The repository is currently bootstrapped with:

- Bun toolchain + Bun runtime on Vercel (`vercel.json` has `bunVersion: "1.x"`)
- Next.js 16 (App Router) under `src/app`
- Drizzle configured for `src/db/schema.ts` + `src/db/migrations` (target paths;
  not committed yet)
- CI workflows (Biome + ESLint, typecheck, Vitest, build)
- Supply-chain security workflows (CodeQL, Dependency Review, Scorecard)

See [docs/architecture/repository-baseline.md](./architecture/repository-baseline.md) for exact mappings to repo files.

## Reading order

1. [PRD.md](../PRD.md)
2. [docs/architecture/overview.md](./architecture/overview.md)
3. [docs/architecture/repository-baseline.md](./architecture/repository-baseline.md)
4. [docs/specs/requirements.md](./specs/requirements.md)
5. [docs/architecture/spec/index.md](./architecture/spec/index.md)
6. [docs/architecture/adr/index.md](./architecture/adr/index.md)
7. [docs/architecture/security.md](./architecture/security.md)
8. [docs/architecture/operations.md](./architecture/operations.md)
9. [docs/architecture/runbook.md](./architecture/runbook.md)

## Key external references

- Bun runtime on Vercel: [Vercel Bun runtime docs](https://vercel.com/docs/functions/runtimes/bun)
- Bun lifecycle scripts security model: [trustedDependencies](https://bun.com/docs/pm/lifecycle)
- AI SDK agents: [AI SDK agents](https://ai-sdk.dev/docs/agents/overview)
- AI Gateway: [AI Gateway](https://vercel.com/docs/ai-gateway)
- QStash Next.js quickstart: [Upstash QStash](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs)
