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

- Ensure worker endpoints verify QStash signatures (Upstash QStash signature
  verification: [Upstash QStash signature verification](https://upstash.com/docs/qstash/verify)).
- For local development, you may need to trigger test messages from the Upstash
  dashboard (Upstash QStash overview: [Upstash QStash overview](https://upstash.com/docs/qstash/overview)).

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

### Vector indexing not returning results

- Confirm Upstash Vector URL/token are set.
- Confirm chunks are being created and indexed.
- For repos, confirm repo indexing run completed (Implementation → Repo → Index).

### Implementation run stuck “waiting approval”

- Navigate to the run timeline and approve the pending action.
- If you intended to run fully automatically, adjust approval policy (not
  recommended by default).

### Implementation run stuck “waiting external”

- Check GitHub PR checks and Vercel deployment status links in the run step.
- If webhooks are not configured, the system will poll (slower).

## Rotating secrets

- Rotate `NEON_AUTH_COOKIE_SECRET` to invalidate all active user sessions (requiring users to sign in again).
- Rotate provider tokens (GitHub/Vercel/Neon/Upstash) if compromised.
- Update Vercel environment variables accordingly.
