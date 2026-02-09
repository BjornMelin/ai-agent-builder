# Runbook

Common workflows and troubleshooting for ai-agent-builder.

## Local development

1. Copy env file:

   - `cp .env.example .env.local`

2. Fill required values (see [docs/ops/env.md](../ops/env.md)).
3. Install deps:

   - `bun install`

4. Start dev server:

   - `bun run dev`

### Reproduce a Vercel Preview environment locally (optional)

If you need to reproduce a branch-scoped Preview environment locally, pull the
preview env vars for that branch:

- `vercel env pull --environment=preview --git-branch=<branch>`

### Fix Neon Auth email/password 500s in local development

Use this when `POST <NEON_AUTH_BASE_URL>/sign-in/email` returns `500` for valid
credential users in the local development setup.

Full instructions (prereqs, setup, and CLI reference):

- [docs/ops/neon-auth-local.md](../ops/neon-auth-local.md)

1. Refresh local env from Vercel Development:
   - `vercel env pull --yes --environment=development .env.local`
2. Audit current local Neon Auth wiring and credential health:
   - `bun run auth:audit:local`
3. Repair broken credential users:
   - Auto-detect and repair users that return `500` on a wrong-password probe:
     - `bun run auth:repair:local`
   - Or repair specific users:
     - `bun run auth:repair:local --email agent@example.com --email user@example.com`
   - Dry-run mode:
     - `bun run auth:repair:local --dry-run`
4. Create new users (create-only; no delete/recreate):
   - `bun run auth:create:local --email you@example.com --password 'StrongPass!2026'`
   - Optional: skip sign-in verification:
     - `bun run auth:create:local --email you@example.com --password 'StrongPass!2026' --no-verify`
5. Verify post-repair auth behavior:
   - `bun run auth:smoke:local`
   - Optional success checks with known credentials:
     - `bun run auth:smoke:local --check 'agent@example.com:temporary-password'`

CLI reference:

- All three commands above are wrappers around one unified script:
  - `bun scripts/neon-auth-local.ts --help`
  - `bun scripts/neon-auth-local.ts audit --help`
  - `bun scripts/neon-auth-local.ts create --help`
  - `bun scripts/neon-auth-local.ts repair --help`
  - `bun scripts/neon-auth-local.ts smoke --help`

Important notes:

- These scripts are intended for local development against the Neon
  `vercel-dev` branch by default.
- Repair deletes and recreates affected Neon Auth users (via this repo’s local
  repair script), so user IDs are expected to change.[^aab-neon-auth-local-script]
- Required env: `NEON_AUTH_BASE_URL`, `DATABASE_URL`, `NEON_API_KEY`, and a Neon
  project id via `.neon` or `NEON_PROJECT_ID`.[^aab-neon-auth-local-ops][^neon-auth-overview][^neon-cli-auth]
  Citations follow the repo policy in [SPEC-0007](./spec/SPEC-0007-web-research-citations-framework.md).

### Preview branch env automation

Preview branch env vars are managed by:

- `.github/workflows/vercel-preview-env-sync.yml` (upserts branch-scoped `APP_BASE_URL`)
- `.github/workflows/vercel-preview-env-cleanup.yml` (best-effort cleanup on PR close)
- `.github/workflows/preview-bot-resource-drift-audit.yml` (scheduled/manual bot drift detection + remediation)

Fork PRs skip this automation because GitHub Actions secrets are unavailable for
untrusted forks.

### Bot branch suppression checks

Dependabot/Renovate preview suppression is enforced at three layers:

1. `vercel.json` (`git.deploymentEnabled` branch patterns + `ignoreCommand`)
2. Preview-related GitHub workflows (job-level + in-script bot guards)
3. Scheduled drift audit (`preview-bot-resource-drift-audit.yml`)

Manual verification commands:

- `vercel env list preview dependabot/npm_and_yarn/example`
- `vercel env list preview renovate/example`
- `neon branches list --project-id <project-id> --output json | jq -r '.branches[]?.name' | rg '^preview/(dependabot|renovate)/'`

### Validate preview env resolution (CLI)

1. List branch-scoped preview env vars:
   - `vercel env list preview <branch>`
2. Pull branch preview env vars locally:
   - `vercel env pull --environment=preview --git-branch=<branch> .env.preview.local`
3. Verify `APP_BASE_URL` value under preview branch context:
   - `vercel env run -e preview --git-branch=<branch> -- bun -e "console.log(process.env.APP_BASE_URL)"`
4. Verify app env parsing under the same branch context:
   - `vercel env run -e preview --git-branch=<branch> -- bun -e "import('./src/lib/env').then((m)=>console.log(m.env.app.baseUrl))"`

For full cross-environment validation (env completeness, AI Gateway, Upstash,
database, deployment behavior, and logs), use:

- [docs/ops/env.md](../ops/env.md) → **Validation checklist**

### Run drift audit manually

Use GitHub Actions `workflow_dispatch` for
`.github/workflows/preview-bot-resource-drift-audit.yml`:

1. `mode: audit-only` to inspect without mutation.
2. `mode: audit-and-cleanup` to remove bot-scoped preview env vars and Neon
   preview branches.
3. Investigate/remove any reported bot preview deployments if the workflow fails
   with unresolved deployment drift.

## Database migrations

Generate migration:

- `bun run db:generate`

Apply migration:

- `bun run db:migrate`

## Database connection method (Vercel)

This app targets Vercel’s Fluid compute model and uses a pooled Postgres TCP
connection (`pg`) to Neon, attaching the pool with `attachDatabasePool`.

- Implementation: `src/db/client.ts`
- Reference:
  - [Neon: Connecting to Neon from Vercel](https://neon.com/docs/guides/vercel-connection-methods)
  - [Vercel Functions package reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)

## QStash worker debugging

- Ensure worker endpoints verify QStash signatures. Reference:
  [Upstash QStash signature verification](https://upstash.com/docs/qstash/verify).
- For local development, you may need to trigger test messages from the Upstash
  dashboard. Reference:
  [Upstash QStash overview](https://upstash.com/docs/qstash/overview).

## Workflow DevKit debugging

Interactive runs and chat streams are backed by Workflow DevKit.

- Check workflow endpoints are reachable:
  - `npx workflow health`
- Visual dashboard for runs:
  - `npx workflow web`
- CLI inspection:
  - `npx workflow inspect runs`
  - `npx workflow inspect run <run_id>`

## Common issues

### “Missing env var …”

- The app uses feature-gated env parsing; some pages require additional
  variables.
- Check [docs/ops/env.md](../ops/env.md) and `.env.example`.

### “The app redirect URL is invalid” (Vercel OAuth)

Use this checklist for Sign in with Vercel failures.

If this is happening on a **Preview** deployment, prefer disabling Vercel OAuth
entirely for Preview by setting `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS` to an empty
string. Preview branches get a unique Neon Auth URL, which would otherwise
require per-branch callback URL allowlisting in the Vercel OAuth app
([Neon Auth staging/preview callback note](https://neon.com/blog/handling-auth-in-a-staging-environment)).

If OAuth is disabled on Preview, use **email OTP** or **magic link** auth flows:

- `/auth/email-otp` (recommended)
- `/auth/magic-link`

1. Compute the callback URL from the active environment
   ([Vercel OAuth callback URL formats](https://vercel.com/docs/sign-in-with-vercel/manage-from-dashboard)):
   - `<NEON_AUTH_BASE_URL>/callback/vercel`
   - Example: `https://<neon-auth-host>/neondb/auth/callback/vercel`
2. In the Vercel OAuth App settings, add the callback URL to
   **Authorization Callback URLs**
   ([Vercel OAuth callback setup](https://vercel.com/docs/sign-in-with-vercel/manage-from-dashboard)).
3. In Neon Auth, ensure the Vercel provider is enabled and configured with the
   same client ID/secret as the Vercel OAuth app
   ([Neon Auth OAuth setup](https://neon.com/docs/auth/guides/setup-oauth)).
4. In Neon Auth “Domains”, whitelist the app domain(s) that Neon Auth redirects
   back to after login
   ([Neon Auth trusted domains](https://neon.com/docs/auth/guides/configure-domains)):
   - Local: `http://localhost:3000`
   - Preview: the Vercel preview deployment domain(s)
   - Production: the primary production domain
   - Note: for Vercel Preview branches, the repo includes a best-effort GitHub workflow
     (`.github/workflows/neon-auth-trusted-domains.yml`) that enables
     Neon Auth for the preview branch (if needed) and adds the Preview domain to
     trusted domains automatically.
5. Verify locally
   ([Vercel OAuth callback URL formats](https://vercel.com/docs/sign-in-with-vercel/manage-from-dashboard)):
   - Open `/auth/sign-in`
   - Click
     [“Sign in with Vercel”](https://vercel.com/docs/sign-in-with-vercel/)
   - Confirm you can complete OAuth and return to the app without errors.

### Retrieval not returning results

- Confirm Upstash Vector URL/token are set.
- Confirm chunks are being created and indexed.
- For repo-aware implementation runs:
  - confirm a repo is connected in the project (`/projects/[projectId]/repos`)
  - confirm the implementation run includes a succeeded `impl.repo.index` step
    (bounded indexing into Upstash Vector under `project:{projectId}:repo:{repoId}`)
  - note: the interactive chat toolset focuses on uploaded chunks today; Code
    Mode provides sandbox-backed codebase inspection tools (`sandbox_ls`,
    `sandbox_cat`, `sandbox_grep`, `sandbox_find`) for on-demand retrieval.

## Rotating secrets

- Rotate `NEON_AUTH_COOKIE_SECRET` to invalidate all active user sessions (requiring users to sign in again).
- Rotate provider tokens (GitHub/Vercel/Neon/Upstash) if compromised.
- Update Vercel environment variables accordingly.

[^aab-neon-auth-local-script]: ../../scripts/neon-auth-local.ts
[^aab-neon-auth-local-ops]: ../ops/neon-auth-local.md
[^neon-auth-overview]: <https://neon.com/docs/auth/overview>
[^neon-cli-auth]: <https://neon.com/docs/reference/cli-auth>
