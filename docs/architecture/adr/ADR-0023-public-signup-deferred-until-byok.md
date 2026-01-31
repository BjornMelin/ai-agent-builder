---
ADR: 0023
Title: Public sign-up deferred until BYOK
Status: Deferred
Version: 1.0
Date: 2026-01-31
Supersedes: []
Superseded-by: []
Related: [ADR-0022, ADR-0013]
Tags: [security, cost-controls, auth]
---

## Status

Deferred — 2026-01-31.

## Description

Public sign-up is intentionally disabled until the app implements BYOK for all
metered third-party provider keys (LLM APIs, web research APIs, etc.).

## Context

This application uses metered external services (e.g., AI Gateway, Exa,
Firecrawl). If public sign-up were enabled before BYOK, new users could
authenticate and trigger workflows that consume the admin's API budgets and
incur costs.

We want an eventual path to multiple users, but the cost boundary must be
correct first.

## Decision Drivers

- Prevent unintended API spend and abuse
- Keep production posture simple while the app is still stabilizing
- Preserve a clear, auditable rollout path to public access later

## Decision

Until BYOK is implemented:

- The app runs in `AUTH_ACCESS_MODE=restricted`.
- The app requires `AUTH_ALLOWED_EMAILS` to be configured.
- The app does not expose `/auth/sign-up`.

## Consequences

- Adding users is an admin operation (allowlist update + Neon Auth provisioning)
- OAuth users can authenticate, but the app will deny access unless allowlisted
- Public onboarding is postponed, reducing scope and risk

## Follow-up (when BYOK is implemented)

When BYOK exists and per-user keys are stored/managed securely:

- Switch `AUTH_ACCESS_MODE` to `open`.
- Add back the `/auth/sign-up` view route and enable sign-up in the UI provider.
- Add explicit rate limits and additional abuse protections on costful
  operations.
