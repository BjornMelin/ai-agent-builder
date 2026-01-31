---
ADR: 0022
Title: Authentication: Neon Auth (OAuth + UI) + allowlist access control
Status: Accepted
Version: 1.0
Date: 2026-01-31
Supersedes: [ADR-0002]
Superseded-by: []
Related: [ADR-0021]
Tags: [security, auth, neon, nextjs]
References:
  - [Neon Auth Next.js quickstart (UI Components)](https://neon.com/docs/auth/quick-start/nextjs)
  - [Neon Auth Next.js server SDK reference](https://neon.com/docs/auth/reference/nextjs-server)
  - [Neon Auth production checklist](https://neon.com/docs/auth/production-checklist)
  - [Next.js proxy file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
---

## Status

Accepted — 2026-01-31.

## Description

Use Neon Auth for managed authentication (GitHub OAuth + Vercel OAuth and Neon
Auth UI components) and enforce app-level access control with an explicit
allowlist to prevent unintended API spend.

## Context

The initial plan used a single-password gate for a single user. The product
needs a future-proof authentication approach that can scale to additional users
without rewriting auth, while staying secure and operationally simple.

We also need cost controls: until BYOK exists for metered provider keys, access
must remain limited to a known set of users.

## Decision Drivers

- Fast, managed, production-ready auth (minimal custom code)
- Support GitHub OAuth and Vercel OAuth
- App-level cost control: restrict app access to an allowlist
- Next.js App Router best practices (RSC boundaries, build-time behavior)
- Clear upgrade path to additional users later

## Alternatives

- A: Single-password + signed cookie session (ADR-0002)
  - Pros: simple
  - Cons: not scalable to additional users; custom auth surface area
- B: Auth.js / NextAuth
  - Pros: established ecosystem
  - Cons: more glue and maintenance than Neon Auth for this stack
- C: Neon Auth (chosen)
  - Pros: managed auth + UI components; first-party Neon integration; OAuth
  - Cons: requires Neon Console configuration; app still needs access gating

### Decision Framework

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.7 | 3.40 |
| Application value | 0.30 | 9.6 | 2.88 |
| Maintenance & cognitive load | 0.25 | 9.3 | 2.33 |
| Architectural adaptability | 0.10 | 9.5 | 0.95 |

**Total:** 9.56 / 10.0

## Decision

We will adopt Neon Auth as the only authentication system:

- Neon Auth server SDK (`@neondatabase/auth/next/server`) for server-side session
  validation and API proxying.
- Neon Auth UI components (`@neondatabase/auth/react`) for sign-in/account
  screens.
- Next.js `proxy.ts` for route protection (Next.js 16+).
- App-level allowlist gating to restrict access even for authenticated users.

## Key Design Details

### Routes and UI

- Auth API proxy: `src/app/api/auth/[...path]/route.ts`
- Auth UI routes: `src/app/auth/[path]/page.tsx`
- Account UI routes: `src/app/account/[path]/page.tsx`
- Providers wrapper: `src/app/providers.tsx`

### Restricting access (allowlist)

Even if a user can authenticate via OAuth, the app denies access unless:

- `AUTH_ACCESS_MODE=open`, or
- `AUTH_ACCESS_MODE=restricted` and the session email is in `AUTH_ALLOWED_EMAILS`.

This gates access to routes that call `requireAppUser()` and is intended as a
cost-control mechanism until BYOK is implemented.

### Disabling sign-up (admin-provisioned access)

Until BYOK exists and public sign-up is enabled:

- The app does not expose `/auth/sign-up` via `generateStaticParams()`, and
- The app does not configure sign-up in the Neon Auth UI provider.

This keeps the UI in a sign-in-only posture.

## Consequences

### Positive

- Multi-user capable auth without a redesign (managed by Neon Auth)
- OAuth support (GitHub + Vercel) with minimal app code
- Consistent UI and account management with Neon-provided components
- Clear, explicit access control boundary to prevent unintended API spend

### Negative / Tradeoffs

- Requires Neon Console configuration (OAuth providers, allowed callback URLs)
- Auth availability depends on Neon Auth
- Allowlist adds an extra operational step for adding users (by design)

## Implementation Notes

- `getAuth()` is intentionally lazy to avoid requiring auth env vars at build
  time (Next.js evaluates route modules during `next build`).
- `src/proxy.ts` must exclude `/auth/*` and `/api/auth/*` from protection to
  allow sign-in flows and auth API proxying.
