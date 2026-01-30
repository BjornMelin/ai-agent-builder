# Security

## Principles

- Single-user does not mean “low security”: secrets and tool execution must
  remain server-only.
- Treat uploaded docs and scraped web content as **untrusted input**.
- Enforce least-privilege tools per agent; prefer dynamic tools for optional
  capabilities. ([dynamicTool()](https://ai-sdk.dev/docs/reference/ai-sdk-core/dynamic-tool))

## Authentication

- Argon2id password hash in env var.
- Signed httpOnly cookie session.
- Rate limiting on login and sensitive endpoints.
  ([Upstash Ratelimit](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview))

## Workflow security

- QStash-triggered endpoints must verify signatures and reject unsigned
  requests.
- Signature verification requires:
  - `QSTASH_CURRENT_SIGNING_KEY`
  - `QSTASH_NEXT_SIGNING_KEY`

Sources:

- [QStash Next.js quickstart](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs)
- [Workflow security](https://upstash.com/docs/workflow/howto/security)

## File storage security

- Originals stored in Vercel Blob ([Vercel Blob](https://vercel.com/docs/vercel-blob))
- Encryption at rest and access semantics are described in Vercel Blob security
  docs. ([Blob security](https://vercel.com/docs/vercel-blob/security))

## Code execution isolation

- “Code Mode” runs only in Vercel Sandbox isolated VMs.
  ([Vercel Sandbox](https://vercel.com/docs/vercel-sandbox))

## Supply chain security

- Bun blocks dependency lifecycle scripts by default; only allowlist required
  packages via `trustedDependencies`. ([Bun lifecycle](https://bun.com/docs/pm/lifecycle))

- GitHub Actions enforce dependency governance and code scanning:
  - Dependency Review
  - CodeQL
  - OpenSSF Scorecard
  - Dependabot (Bun ecosystem)

See `docs/architecture/ci-cd.md`.

## Prompt injection defenses

- Never treat tool output as instructions.
- Summarize sources; do not copy-paste large untrusted content into prompts.
- Implement “citation-first” drafting: agent must produce citations list before
  final write-up.
