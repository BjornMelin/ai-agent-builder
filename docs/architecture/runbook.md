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

### Preview branch env automation

Preview branch env vars are managed by:

- `.github/workflows/vercel-preview-env-sync.yml` (upserts branch-scoped `APP_BASE_URL`)
- `.github/workflows/vercel-preview-env-cleanup.yml` (best-effort cleanup on PR close)

Fork PRs skip this automation because GitHub Actions secrets are unavailable for
untrusted forks.

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
- Repo indexing and approval-gated implementation steps are spec’d but not yet
  implemented in this repository snapshot (see
  [SPEC-0016](./spec/SPEC-0016-implementation-runs-end-to-end-build-and-deploy.md),
  [SPEC-0017](./spec/SPEC-0017-repo-ops-and-github-integration.md),
  [SPEC-0018](./spec/SPEC-0018-infrastructure-provisioning-and-secrets-for-target-apps.md)).

## Rotating secrets

- Rotate `NEON_AUTH_COOKIE_SECRET` to invalidate all active user sessions (requiring users to sign in again).
- Rotate provider tokens (GitHub/Vercel/Neon/Upstash) if compromised.
- Update Vercel environment variables accordingly.
