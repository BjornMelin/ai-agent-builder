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

## QStash worker debugging

- Ensure worker endpoints verify QStash signatures.
- For local development, you may need to trigger test messages from the Upstash
  dashboard.

## Common issues

### “Missing env var …”

- The app uses feature-gated env parsing; some pages require additional
  variables.
- Check [docs/ops/env.md](../ops/env.md) and `.env.example`.

### “The app redirect URL is invalid” (Vercel OAuth)

Use this checklist for Sign in with Vercel failures.

1. Compute the callback URL from the active environment:
   - `<NEON_AUTH_BASE_URL>/callback/vercel`
   - Example: `https://<neon-auth-host>/neondb/auth/callback/vercel`
2. In the Vercel OAuth App settings, add the callback URL to **Authorization Callback URLs**.
3. In Neon Auth, ensure the Vercel provider is enabled and configured with the
   same client ID/secret as the Vercel OAuth app.
4. In Neon Auth “Domains”, whitelist the app domain(s) that Neon Auth redirects
   back to after login:
   - Local: `http://localhost:3000`
   - Preview: the Vercel preview deployment domain(s)
   - Production: the primary production domain
5. Verify locally:
   - Open `/auth/sign-in`
   - Click “Sign in with Vercel”
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

- Rotate `NEON_AUTH_COOKIE_SECRET` to invalidate session cache.
- Rotate provider tokens (GitHub/Vercel/Neon/Upstash) if compromised.
- Update Vercel environment variables accordingly.
