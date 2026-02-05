---
spec: SPEC-0002
title: Authentication & access control
version: 1.1.0
date: 2026-02-02
owners: ["Bjorn Melin"]
status: Implemented
related_requirements: ["FR-001", "NFR-001", "NFR-002", "NFR-012"]
related_adrs: ["ADR-0022", "ADR-0023", "ADR-0021"]
notes:
  "Defines Neon Auth integration, Next.js proxy-based route protection, and
  allowlist-based app access control."
---

## Summary

Defines Neon Auth integration, secure cookie sessions, and access control for
all routes (unauthenticated redirect + allowlist gating).

## Context

The app is private by default and must remain protected while the product is
still stabilizing and uses metered third-party APIs. We also want an auth
approach that can scale to additional users later without redesigning the
authentication subsystem.

## Goals / Non-goals

### Goals

- Managed authentication via Neon Auth (UI components + server SDK)
- OAuth sign-in via GitHub and Vercel
- Secure cookie-based sessions (managed by Neon Auth)
- Route protection via Next.js `proxy.ts`
- App-level allowlist gating (cost control) until BYOK is implemented

### Non-goals

- Building a custom auth system (password hashing, session encoding, CSRF)
- Public sign-up (deferred until BYOK; see ADR-0023)
- Organizations/teams/invitations flows (out of scope for now)

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-001:** Managed authentication via Neon Auth with secure, server-managed
  session cookies and app-level access control.

### Non-functional requirements

- **NFR-001 (Security):** Protect all sensitive routes, server-only keys, secure
  cookies.
- **NFR-002 (Private access mode):** Default to restricted access (allowlist);
  do not require multi-tenant constructs.
- **NFR-012 (BYOK gating):** Public sign-up must remain disabled until the app
  supports BYOK for metered third-party keys.

## Constraints

- Neon Auth is the only authentication provider used by the app.
- All non-auth routes must require authentication.
- App access is restricted to an allowlist by default.

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.7 | 3.40 |
| Application value | 0.30 | 9.6 | 2.88 |
| Maintenance & cognitive load | 0.25 | 9.3 | 2.33 |
| Architectural adaptability | 0.10 | 9.5 | 0.95 |

**Total:** 9.56 / 10.0

## Design

### Architecture overview

- Neon Auth server instance:
  - `src/lib/auth/neon-auth.server.ts` provides a lazy `getAuth()` singleton.
  - Laziness avoids requiring auth env vars at build time (Next.js evaluates
    some modules during `next build`).
  - Server components that call Neon Auth methods (for example,
    `getAuth().getSession()` or other `auth.getSession()`/`auth.getUser()` calls
    originating from `src/lib/auth/neon-auth.server.ts`) must export
    `export const dynamic = "force-dynamic"` to force dynamic rendering; see the
    Neon Auth Next.js server SDK docs and Next.js route segment config docs for
    details.
- Auth API proxy:
  - `src/app/api/auth/[...path]/route.ts` proxies all Neon Auth endpoints and
    exports `GET`, `POST`, `PUT`, `PATCH`, `DELETE` handlers from
    `getAuth().handler()`.
- Route protection:
  - `src/proxy.ts` uses `getAuth().middleware()` to redirect unauthenticated users to
    `/auth/sign-in`.
  - The proxy matcher excludes `/auth/*` and `/api/auth/*`.
- App-level allowlist:
  - `src/lib/auth/require-app-user.ts` exports `requireAppUser()`.
  - Routes that must enforce allowlisted access call `requireAppUser()` and
    redirect to `/auth/sign-out?redirectTo=/auth/denied` when
    authenticated-but-not-allowed (clears cookies).

### Data contracts

- Auth/session data is owned by Neon Auth and accessed via `auth.getSession()`.
- App-level allowlist matching normalizes emails to lowercase.

### File-level contracts

- `src/proxy.ts`: route protection (unauthenticated redirect)
- `src/app/auth/[path]/page.tsx`: Neon Auth UI routes (sign-in, sign-out, etc.)
- `src/app/account/[path]/page.tsx`: Neon Auth account UI (settings, security)
- `src/app/auth/denied/page.tsx`: allowlist denial page
- `src/app/providers.tsx`: `NeonAuthUIProvider` configuration and header
- `src/lib/auth/require-app-user.ts`: `requireAppUser()` allowlist guard
- `src/lib/auth/neon-auth.client.ts`: browser auth client
- `src/lib/auth/neon-auth.server.ts`: `getAuth()` server singleton
- `src/lib/auth/social-providers.ts`: parses `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS`

### Configuration

- See `docs/ops/env.md` for env vars used by auth and access control:
  - `NEON_AUTH_BASE_URL`
  - `NEON_AUTH_COOKIE_SECRET`
  - `NEON_AUTH_COOKIE_DOMAIN` (optional)
  - `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS` (optional)
  - `AUTH_ACCESS_MODE` (optional)
  - `AUTH_ALLOWED_EMAILS` (required when restricted)

## Acceptance criteria

- Unauthenticated requests to non-auth routes are redirected to `/auth/sign-in`.
- Authenticated requests by non-allowlisted users are signed out and end on
  `/auth/denied` (default posture).
- `/auth/sign-up` is not exposed while BYOK is not implemented.

## Testing

- Unit: `src/lib/env.test.ts` covers auth env validation and allowlist parsing.
- Unit: `src/lib/auth/require-app-user.test.ts` covers allowlist denial redirect
  behavior.
- Build: `bun run build` succeeds without auth env vars during build time (lazy
  `getAuth()` instance creation).
- Future E2E: sign-in (OAuth) + allowlist gate.

## Operational notes

- See [docs/ops/env.md](../../ops/env.md) for environment variables.
- Neon Console configuration:
  - Enable Neon Auth and configure OAuth providers (GitHub, Vercel).
    [Neon Auth](https://neon.com/docs/auth/overview) and
    [OAuth setup](https://neon.com/docs/auth/guides/setup-oauth)
  - For local development, copy the Auth Base URL into `NEON_AUTH_BASE_URL`.
    [Neon Auth](https://neon.com/docs/auth/overview)
  - For Vercel Preview deployments, prefer the Neon ↔ Vercel integration with
    Preview Branching enabled; it injects `NEON_AUTH_BASE_URL` per Preview
    branch automatically.

- Environment policy:
  - Local/development: set `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS=vercel`.
  - Preview: set `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS` to an empty string (disable social providers).
  - Production: set `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS=github,vercel`.
  - See `docs/ops/env.md`.

## Failure modes and mitigation

- Auth env missing/invalid → fail on first use with `AppError` (`env_invalid`).
- Allowlist misconfigured → safe default is denial of access.

## Key files

- `src/proxy.ts`
- `src/app/api/auth/[...path]/route.ts`
- `src/app/auth/[path]/page.tsx`
- `src/app/account/[path]/page.tsx`
- `src/app/providers.tsx`
- `src/lib/auth/require-app-user.ts`
- `src/lib/auth/neon-auth.server.ts`

## References

- [Neon Auth Next.js quickstart (UI Components)](https://neon.com/docs/auth/quick-start/nextjs)
- [Neon Auth Next.js server SDK reference](https://neon.com/docs/auth/reference/nextjs-server)
- [Neon Auth production checklist](https://neon.com/docs/auth/production-checklist)
- [Next.js proxy file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)

## Changelog

- **1.1.0 (2026-02-02)**: Clarified allowlist enforcement details and test/env validation coverage.
- **1.0 (2026-01-31)**: Migrated to Neon Auth + allowlist access control.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
- **0.1 (2026-01-29)**: Initial draft.
