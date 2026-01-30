---
spec: SPEC-0002
title: Authentication & access control
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["FR-001", "NFR-001", "NFR-002", "IR-003"]
related_adrs: ["ADR-0002"]
notes: "Defines single-user auth, session management, and route protection."
---

## Summary

Defines password-only auth, session cookies, and access control for all routes.

## Context

The app is single-user but must be accessible from multiple devices. We need a minimal but secure authentication system without external identity providers.

## Goals / Non-goals

### Goals

- Password-only login with secure hashing
- Signed, httpOnly session cookies
- Route protection via middleware
- Rate limiting for auth endpoints

### Non-goals

- Multi-user accounts and RBAC
- OAuth providers

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-001**

### Non-functional requirements

- **NFR-001**
- **NFR-002**

### Performance / Reliability requirements (if applicable)

- **PR-001**

### Integration requirements (if applicable)

- **IR-003**

## Constraints

- Never store password in DB
- Session secret stored only in env
- All protected routes require auth

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.3 | 3.25 |
| Application value | 0.30 | 9.1 | 2.73 |
| Maintenance & cognitive load | 0.25 | 9.2 | 2.30 |
| Architectural adaptability | 0.10 | 9.0 | 0.90 |

**Total:** 9.19 / 10.0

## Design

### Architecture overview

- Route handler verifies password and issues session cookie.
- Middleware checks session on every request to `(app)` routes.

### Data contracts

- Cookie payload: `{sid, iat}` signed and optionally encrypted.
- Rate limit keys: IP + route.

### File-level contracts

- `src/app/(auth)/login/page.tsx`: login UI
- `src/app/api/auth/login/route.ts`: login handler
- `src/app/api/auth/logout/route.ts`: logout handler
- `src/middleware.ts`: protection gate
- `src/lib/auth/session.ts`: cookie helpers

## Acceptance criteria

- Unauthenticated requests to protected routes redirect to `/login`
- Login rate limit prevents brute-force attempts
- Cookie is httpOnly and Secure in production

## Testing

- Unit: session encode/decode and password verification
- Integration: middleware blocks protected pages
- E2E: login/logout flow (Playwright later)

## Operational notes

- Rotate `SESSION_SECRET` safely (invalidate sessions)

## Failure modes and mitigation

- Session secret misconfigured → fail startup with explicit error
- Rate limit misconfigured → default to conservative limits

## Key files

- `src/app/(auth)/login/page.tsx`
- `src/app/api/auth/login/route.ts`
- `src/lib/auth/session.ts`

## References

- [Upstash Ratelimit](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
