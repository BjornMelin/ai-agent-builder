---
ADR: 0029
Title: Skills registry integration (skills.sh) with UI installs + bundled DB skill files
Status: Implemented
Version: 0.1
Date: 2026-02-09
Supersedes: []
Superseded-by: []
Related: [ADR-0028, ADR-0010, ADR-0013, ADR-0026, ADR-0021]
Tags: [agents, skills, nextjs, workflow, blob, security]
Related-Requirements: [FR-035, FR-036, FR-037, NFR-001, NFR-006, NFR-013, NFR-014, NFR-016, IR-006, IR-011]
References:
  - [skills.sh docs](https://skills.sh/docs)
  - [skills.sh CLI docs](https://skills.sh/docs/cli)
  - [skills.sh search API](https://skills.sh/api/search)
  - [vercel-labs/skills (GitHub)](https://github.com/vercel-labs/skills)
---

## Status

Implemented — 2026-02-09.

## Context

The app uses Agent Skills (progressive disclosure) to keep system prompts small
while providing deep, task-specific workflows (Sandbox, Workflow DevKit, AI SDK,
etc.). The base implementation supports:

- repo-bundled filesystem skills
- project-scoped DB skills that override filesystem skills by normalized name

Teams need a **UI-managed** way to discover and install skills from the public
ecosystem (skills.sh) without requiring developers to:

- edit the repo to add skill folders
- copy/paste `SKILL.md` into the DB manually

We must preserve the security posture:

- Do not execute skill-bundled code in the app runtime.
- Any execution must remain sandboxed and approval-gated (ADR-0010).
- Do not leak Blob URLs/pathnames to clients (public-only storage).

## Decision Drivers

- High leverage: reuse skills.sh registry and GitHub-hosted skills.
- Strong security: no runtime `npx` or repo writes; strict size/SSRF guardrails.
- Maintainability: simple contracts, minimal new surface area, strict TS.
- UX: install/update/uninstall from the project Skills tab.

## Alternatives Considered

### A. Run `npx skills add/remove` in app runtime

Pros:

- Matches the official CLI behavior.

Cons:

- Unacceptable supply-chain risk (runtime package execution).
- Operational complexity (filesystem writes, caching, cleanup).
- Conflicts with serverless tracing + immutable deployments.

### B. Run `npx skills` inside Vercel Sandbox

Pros:

- Isolation from app runtime.

Cons:

- Still requires package execution (supply chain + allowlist complexity).
- Introduces a new control plane (tokens, policy, caching, output validation).
- Harder UX (async installs, logs, retries) for a first iteration.

### C. Use skills.sh search + GitHub archive ingestion + DB/Blob bundles (**Chosen**)

Pros:

- No runtime package execution.
- Deterministic parsing: resolve `SKILL.md` by frontmatter `name`.
- Files for `skills.readFile` are supported via a bundle ZIP stored in Blob.
- Fits existing precedence model (DB overrides FS).

Cons:

- Requires careful bounds (archive size, bundle limits).
- Update semantics are “reinstall” (no pinning/version UI yet).

### D. Write skills into repo directories from the UI

Pros:

- Skills become part of the repo skill library.

Cons:

- Not compatible with serverless/immutable deploys.
- Requires RepoOps + PR flows (large scope, high risk for this feature).

## Decision Framework (must be ≥ 9.0)

Weights:

- Solution leverage: 35%
- Application value: 30%
- Maintenance and cognitive load: 25%
- Architectural adaptability: 10%

| Option | Leverage | Value | Maintenance | Adaptability | Weighted total |
| --- | ---: | ---: | ---: | ---: | ---: |
| A. Runtime `npx skills` | 6.5 | 7.5 | 3.0 | 5.5 | 5.74 |
| B. Sandbox `npx skills` | 7.8 | 8.6 | 7.0 | 8.2 | 7.85 |
| C. Search API + GitHub zip + DB/Blob bundles | 9.4 | 9.3 | 8.8 | 9.0 | **9.16** |
| D. Repo write/PR-based installs | 6.8 | 7.2 | 5.6 | 8.6 | 6.70 |

## Decision

Implement registry management as:

1. Search via `skills.sh/api/search`.
2. Install/update via a **Workflow DevKit** workflow:
   - Download GitHub archive ZIP (`main` → `master` fallback).
   - Resolve the chosen skill by matching `SKILL.md` frontmatter `name` to the
     requested `skillId`.
   - Bundle the skill directory into a ZIP and upload to Vercel Blob.
   - Upsert the skill into `project_skills` with server-only metadata
     referencing the registry id and bundle blob pathname.
3. Uninstall deletes the DB record and best-effort deletes the bundle blob.
4. `skills.readFile` supports DB skills **only when** they have a valid bundle
   reference.

Details and file-level contracts are defined in:

- [SPEC-0028](../spec/SPEC-0028-skills-registry-ui-and-bundled-installs.md)
- [SPEC-0027](../spec/SPEC-0027-agent-skills-runtime-integration.md)

## Consequences

### Positive outcomes

- Users can install skills from the UI without redeploying or editing the repo.
- Read-only file access works for installed skills (bundled ZIP).
- Avoids runtime `npx` execution and keeps the app runtime minimal.

### Negative outcomes / risks

- GitHub archive downloads can fail/rate-limit.
  - Mitigation: optional `GITHUB_TOKEN`, strict timeouts, durable retries.
- Public-only Blob means bundles must be treated as sensitive.
  - Mitigation: never send blob URLs/pathnames to clients; redact metadata.

## Changelog

- **0.1 (2026-02-09)**: Initial version. Implemented as part of SPEC-0028.
