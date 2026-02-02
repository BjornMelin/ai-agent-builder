# Security Model

## Threat model summary

ai-agent-builder executes high-impact operations:

- reads private project documents
- performs web research
- generates specs and prompts
- modifies codebases and triggers deployments (Implementation Runs)

Primary threats:

- credential leakage (provider tokens)
- command execution escape / abuse
- supply-chain compromise
- unintended destructive side effects (bad automation)
- data exfiltration via web tools or prompt injection

## Security principles

1. **Server-only secrets**
   - never expose provider keys to client bundles
   - keep secrets out of the database

2. **Least privilege**
   - use minimal scopes for GitHub/Vercel/Neon/Upstash credentials

3. **Sandbox isolation**
   - execute code and commands only inside Vercel Sandbox
   - treat uploads and web content as untrusted

4. **Approval gates for side effects**
   - pushing/merging PRs, provisioning infra, and production deploys require
     explicit user approval
   - approvals are persisted for audit

5. **Auditable, deterministic outputs**
   - persist run steps, tool calls, and external IDs
   - export deterministic bundles

## Authentication & session security

- Managed authentication via Neon Auth.
- Route protection uses Next.js `proxy.ts`.
- App access is allowlist-gated by default (private access mode) until BYOK is
  implemented.

See:

- [SPEC-0002](./spec/SPEC-0002-authentication-access-control.md)
- [ADR-0022](./adr/ADR-0022-authentication-neon-auth-oauth-allowlist.md)
- [ADR-0023](./adr/ADR-0023-public-signup-deferred-until-byok.md)

## Tooling and prompt-injection defenses

- Treat web content as untrusted; do not follow instructions embedded in pages.
- Implement tool call policies:
  - restrict tools per agent role (least privilege)
  - cap web calls and sandbox jobs per run (budgets)
- Require citations for research claims (reduces hallucination risk).

## Provider credential handling

- All provider keys are configured via environment variables (Vercel env in prod).
- No provider token or connection string is stored in Neon.
- Logs and artifacts must redact:
  - Authorization headers.
  - tokens embedded in URLs.
  - connection strings.

Recommended credential types:

- GitHub: fine-grained PAT or GitHub App credentials
- Vercel: access token with minimal project scopes
- Neon: API key with least privilege
- Upstash: Developer API key (only if using a native account) + per-resource REST
  tokens for runtime

## Sandbox safety

- Commands run in Vercel Sandbox; app runtime never runs repo code.
- Allowlist commands; block destructive operations by default.
- Redact secrets from sandbox transcripts before persistence.

See:

- [ADR-0010](./adr/ADR-0010-safe-execution-vercel-sandbox-bash-tool-code-execution-ctx-zip.md)
- [SPEC-0019](./spec/SPEC-0019-sandbox-build-test-and-ci-execution.md)

## Supply chain security

CI should enforce:

- dependency review
- dependabot
- CodeQL
- OpenSSF Scorecard

See [CI/CD](./ci-cd.md) and
[SPEC-0012](./spec/SPEC-0012-ci-cd-pipeline-and-supply-chain-security-controls.md).

## Incident response (minimum)

- rotate `NEON_AUTH_COOKIE_SECRET` if compromised (invalidates session cache)
- rotate provider tokens (GitHub/Vercel/Neon/Upstash)
- audit run logs for suspicious side-effect attempts
