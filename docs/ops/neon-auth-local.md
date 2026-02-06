# Neon Auth Local Scripts

This repo includes a single, unified CLI for **local development** workflows
against **Neon Auth** (email/password), plus helpers to diagnose and repair the
common `500` failure mode on `POST <NEON_AUTH_BASE_URL>/sign-in/email`.

Script entrypoint:

- `scripts/neon-auth-local.ts`

Convenience wrappers:

- `bun run auth:audit:local`
- `bun run auth:create:local`
- `bun run auth:repair:local`
- `bun run auth:smoke:local`

## When To Use This

Use these scripts when:

- You are developing locally with Vercel **development** environment variables.
- Your `NEON_AUTH_BASE_URL` points at the Neon `vercel-dev` branch (default).
- Email/password sign-in returns `500` for users that should be valid.

## Prerequisites

1. Bun installed (repo scripts use Bun only).
2. Vercel CLI installed and authenticated:
   - `vercel login`
   - The repo must be linked to the right Vercel project (typically `vercel link`).
   - Vercel CLI docs: https://vercel.com/docs/cli
3. Neon CLI installed and authenticated:
   - `neon auth`
   - Neon CLI docs: https://neon.com/docs/reference/neon-cli
4. Environment variables available locally:
   - `NEON_AUTH_BASE_URL`
   - `DATABASE_URL`
   - `NEON_API_KEY`
   - Neon project id via either:
     - `NEON_PROJECT_ID`, or
     - a `.neon` file created by `neon init` (recommended)

## Setup (Local Development)

1. Pull Vercel **development** environment variables into `.env.local`:

```bash
vercel env pull --yes --environment=development .env.local
```

`vercel env pull` docs: https://vercel.com/docs/cli/env#exporting-development-environment-variables

2. Confirm the script can resolve the Neon Auth branch and endpoint:

```bash
bun scripts/neon-auth-local.ts info
```

You should see:

- `Resolved Branch` = `vercel-dev` (default expected branch)
- `Auth Endpoint` = `ep-...` (derived from `NEON_AUTH_BASE_URL`)

If the resolved branch is not `vercel-dev`, either:

- Fix `NEON_AUTH_BASE_URL`/`DATABASE_URL` so they point at the intended branch, or
- Pass `--expected-branch-name <branch>`, or
- Use `--allow-branch-mismatch` (not recommended unless you are sure).

## CLI Reference

Show help:

```bash
bun scripts/neon-auth-local.ts --help
bun scripts/neon-auth-local.ts audit --help
bun scripts/neon-auth-local.ts create --help
bun scripts/neon-auth-local.ts repair --help
bun scripts/neon-auth-local.ts smoke --help
```

### `audit` (diagnose)

Runs a best-effort audit of your local wiring and current credential user rows.

Typical usage:

```bash
bun run auth:audit:local
```

What it checks:

- Neon Auth endpoint resolves to the expected Neon branch name (`vercel-dev` by default).
- (Optional) Pulls Vercel development env to compare `NEON_AUTH_BASE_URL` and `DATABASE_URL`.
- Lists existing `credential` users from `neon_auth` schema and probes sign-in with a wrong password.
  - Wrong-password should be `401`.
  - A `500` is treated as suspicious and usually indicates a broken credential row.

Useful flags:

- `--skip-vercel-pull` to avoid calling Vercel CLI.
- `--no-strict` to avoid exiting non-zero when issues are detected.

### `create` (create-only user creation)

Creates new **email/password** Neon Auth users without deleting anything.

Create a single user with explicit password:

```bash
bun run auth:create:local --email you@example.com --password 'StrongPass!2026'
```

Create multiple users (repeat `--email`):

```bash
bun run auth:create:local \
  --email agent@example.com \
  --email user@example.com \
  --password 'StrongPass!2026'
```

Generate a password (script prints it):

```bash
bun run auth:create:local --email you@example.com
```

Flags:

- `--no-verify` skips the follow-up sign-in verification.
- `--name "Display Name"` sets the same display name for all created emails.
- `--dry-run` prints planned actions without calling Neon APIs.

### `repair` (delete+recreate broken users)

Repairs credential users that are failing sign-in (typically returning `500`).
This works by deleting the Neon Auth user via supported Neon APIs and then
recreating via email/password sign-up.

Important:

- **User IDs will change** (delete+recreate).
- Intended for local development only.

Auto-detect broken users and repair them:

```bash
bun run auth:repair:local
```

Repair specific users:

```bash
bun run auth:repair:local --email agent@example.com --email user@example.com
```

Dry run:

```bash
bun run auth:repair:local --dry-run
```

### `smoke` (sanity checks)

Runs quick assertions that your Neon Auth email/password behavior is sane.

Default smoke test (wrong-password should yield `401` for every credential user):

```bash
bun run auth:smoke:local
```

Optional success checks for known credentials:

```bash
bun run auth:smoke:local --check 'agent@example.com:temporary-password'
```

## Troubleshooting

### `Resolved branch "X" does not match expected "vercel-dev"`

Most commonly you have one of these mismatches:

- `NEON_AUTH_BASE_URL` points at a different Neon branch than you intended.
- `DATABASE_URL` points at a different Neon branch than `NEON_AUTH_BASE_URL`.

Fix by re-pulling Vercel development env vars and/or selecting the correct local
branch env, then re-run `audit`.

### Vercel env pull fails

Confirm:

- `vercel login` has been run.
- The repo is linked to the correct project (`vercel link`).

### Create/repair returns non-200 from `/sign-up/email`

Check:

- The Neon Auth URL is correct for the project/branch.
- Email/password auth is enabled for the Neon branch (see Neon Console Auth configuration).

Neon Auth docs: https://neon.com/docs/guides/neon-auth

