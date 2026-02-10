---
ADR: 0028
Title: Agent Skills progressive disclosure (hybrid filesystem + DB)
Status: Implemented
Version: 0.1
Date: 2026-02-09
Supersedes: []
Superseded-by: []
Related: [ADR-0006, ADR-0010, ADR-0013, ADR-0021, ADR-0026, ADR-0029]
Tags: [ai-sdk, agents, nextjs, workflow, security, caching]
Related-Requirements: [FR-035, FR-036, NFR-006, NFR-013, NFR-014, NFR-016]
References:
  - [AI SDK cookbook: Add Skills to Your Agent](https://ai-sdk.dev/cookbook/guides/agent-skills)
  - [1Password: From Magic to Malware (Agent Skills attack surface)](https://1password.com/blog/from-magic-to-malware-how-openclaws-agent-skills-become-an-attack-surface)
  - [Vercel KB: Using files in Serverless Functions](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions)
---

## Status

Implemented — 2026-02-09.

## Context

This app relies on multiple agents and workflows (chat, research, code mode,
implementation runs). Agents need **specialized, high-signal workflows** (e.g.
Workflow DevKit patterns, Sandbox safety, AI SDK usage) but the system prompt
must remain small to preserve:

- cost controls (token budgets)
- relevance (avoid noisy instructions)
- reliability (reduce prompt drift)

We also need **project-scoped customization** so a project can override or
extend the default skills without requiring a redeploy.

## Decision Drivers

- Progressive disclosure (small prompt index, load full instructions on demand)
- Per-project overrides with deterministic precedence
- Safe-by-default: no code execution from skill content in app runtime
- Vercel/Next.js serverless compatibility (skill files must be traced/bundled)
- Maintainability: strict TS, simple resolution rules, minimal new surface area

## Alternatives Considered

### A. Filesystem-only skills (repo-bundled)

Pros:

- Very low maintenance and operational complexity.
- Skills are versioned and reviewed via PRs.
- Deterministic deploys.

Cons:

- No per-project customization without redeploy.
- Cannot support non-developer editing via UI.

### B. Database-only skills (project-defined)

Pros:

- Maximum flexibility and per-project customization.
- No reliance on filesystem tracing for skills.

Cons:

- Higher maintenance burden (validation, governance, drift management).
- Loses the “vetted standard library” properties of repo-bundled skills.

### C. Hybrid filesystem + DB (DB overrides by normalized name) (**Chosen**)

Pros:

- Repo ships a vetted “standard library” of skills.
- Projects can override/extend skills without redeploy.
- Clear precedence rule: DB wins on normalized name collisions.

Cons:

- Added complexity: merging/indexing semantics and cache invalidation.
- Requires careful path confinement for any file reads.

### D. Filesystem-only with project-local overrides in-repo

Pros:

- Override semantics without DB schema/migrations.
- Git-tracked overrides.

Cons:

- Requires writing to the repo (not compatible with this app’s product UX).
- Still effectively requires redeploy/branch management for updates.

## Decision Framework

Weights:

- Solution leverage: 35%
- Application value: 30%
- Maintenance and cognitive load: 25%
- Architectural adaptability: 10%

| Option | Leverage | Value | Maintenance | Adaptability | Weighted total |
| --- | ---: | ---: | ---: | ---: | ---: |
| A. Filesystem-only | 6.8 | 5.8 | 9.2 | 4.6 | 7.06 |
| B. Database-only | 8.6 | 9.1 | 7.2 | 9.0 | 8.42 |
| C. Hybrid FS + DB overrides | 9.4 | 9.3 | 8.6 | 9.0 | **9.13** |
| D. FS-only + project-local overrides | 7.4 | 6.4 | 8.4 | 6.0 | 7.25 |

Consensus process artifacts used in evaluation:

- Exa deep research task: `01kh25d2yzphpxetpdat8ym2mf`
- Zen consensus continuation: `c845be0a-d38e-47d2-8445-65eeccd705c4`

## Decision

Adopt **Hybrid FS + DB Agent Skills** with **progressive disclosure**:

1. Repo-bundled skills live in the filesystem and are discovered from
   `AGENT_SKILLS_DIRS`.
2. Projects can define DB skills that override filesystem skills by normalized
   name (`trim().toLowerCase()`).
3. Agents only see `{name, description}` in the prompt. Full instructions are
   loaded on-demand via:
   - `skills.load` (load skill body)
   - `skills.readFile` (read repo-bundled skill files and bundled DB skill
     files when present; strict path safety)
4. Skill-bundled scripts are **not executed** by the app runtime. Any future
   execution must be implemented as separate sandbox tools and gated by explicit
   approvals (see ADR-0010).

Implementation details are defined in:

- [SPEC-0027](../spec/SPEC-0027-agent-skills-runtime-integration.md)
- [SPEC-0028](../spec/SPEC-0028-skills-registry-ui-and-bundled-installs.md)

## Consequences

### Positive outcomes

- Skill workflows scale without prompt bloat (progressive disclosure).
- Teams can adapt skills per project without redeploy.
- Read-only file access and sandbox-only execution preserve security posture.

### Negative outcomes / risks

- Added complexity in resolution/debugging (two sources).
  - Mitigation: deterministic precedence, normalized-name resolution, and UI
    showing “effective skills”.
- Untrusted DB skill content can cause prompt injection.
  - Mitigation: skills remain text-only; side-effectful tools remain
    least-privilege + approval-gated.

## Changelog

- **0.1 (2026-02-09)**: Initial version. Implemented as part of SPEC-0027.
