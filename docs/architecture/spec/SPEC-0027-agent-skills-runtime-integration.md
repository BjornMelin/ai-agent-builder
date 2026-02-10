---
spec: SPEC-0027
title: Agent Skills runtime integration (progressive disclosure)
version: 0.2.0
date: 2026-02-09
owners: ["Bjorn Melin"]
status: Implemented
related_requirements: ["FR-035", "FR-036", "FR-037", "NFR-006", "NFR-013", "NFR-014", "NFR-016"]
related_adrs: ["ADR-0028", "ADR-0029", "ADR-0006", "ADR-0010", "ADR-0013", "ADR-0021", "ADR-0026"]
related_specs: ["SPEC-0006", "SPEC-0009", "SPEC-0016", "SPEC-0022"]
notes: "Add runtime-loadable Agent Skills (SKILL.md progressive disclosure) with repo-bundled filesystem skills and project-scoped DB overrides (including optional bundled resources for DB skills), wired into chat, code mode, and implementation planning."
---

## Summary

This spec implements **Agent Skills** as a progressive-disclosure mechanism for
specialized agent workflows.

Agents receive only a **skills index** (name + description) in their system
prompt. When a task matches a skill description, the agent calls `skills.load`
to load the full instructions into context.

Skill sources:

1. Repo-bundled filesystem skills under `AGENT_SKILLS_DIRS` (default:
   `.agents/skills,.codex/skills`)
2. Project-scoped DB overrides (higher precedence)

## Scope

### In scope

- Skill discovery from repo-bundled `SKILL.md` files (frontmatter + body).
- Project-scoped overrides in Postgres (per-project CRUD).
- Tool contract: `skills.load` + `skills.readFile` (read-only).
- Wiring into:
  - project chat (`@workflow/ai` DurableAgent)
  - Code Mode (sandboxed `ToolLoopAgent`)
  - implementation planning step (`ToolLoopAgent` structured output)
- Cache Components integration (`"use cache"` + cache tags) for stable reads.
- Serverless deployment: ensure skill files are included in output traces.

### Out of scope

- Executing skill-bundled scripts (must remain disallowed unless sandboxed +
  approval-gated; see ADR-0028).
- Marketplace / sharing skills across projects/users.
- Skill version pinning and upgrade notification flows.

## Skill Format

A repo-bundled skill is a directory containing `SKILL.md`:

```text
my-skill/
  SKILL.md
  scripts/        (optional)
  references/     (optional)
  assets/         (optional)
```

`SKILL.md` begins with YAML frontmatter containing:

- `name` (required)
- `description` (required; supports multi-line YAML block scalars)

The remainder of the file is the skill body (markdown instructions).

## Interfaces and Contracts

### Database

Table: `project_skills` (see `src/db/schema.ts` and migration `0008_*`).

Key fields:

- `project_id` (FK; cascade delete)
- `name_norm` (unique per project; lowercased+trimmed)
- `name`, `description`
- `content` (full SKILL.md text; frontmatter optional but canonicalized by API)
- `metadata` (JSON; reserved)

### Cache Tags

- `tagProjectSkillsIndex(projectId)` (`src/lib/cache/tags.ts`)
- All skill list/lookups tag `tagProjectSkillsIndex(projectId)`
- Writes call `revalidateTag(tagProjectSkillsIndex(projectId), "max")`

### Env

- `AGENT_SKILLS_DIRS` (optional; default `.agents/skills,.codex/skills`)
  - Implemented in `src/lib/env.ts` (`env.skills.dirs`)
  - Documented in `docs/ops/env.md` and `.env.example`
  - Supported values: `.agents/skills`, `.codex/skills` (subset allowed)

### Tool Contract (Read-only)

#### `skills.load`

Input:

- `{ name: string }`

Output:

- `{ ok: true, name, source, skillDirectory, content }` or `{ ok: false, error }`

Notes:

- `content` is the markdown body with frontmatter stripped.
- `skillDirectory` is a **repo-relative** directory path when the skill is
  repo-bundled; `null` for DB skills (and for filesystem skills outside the
  repo root).

#### `skills.readFile`

Input:

- `{ name: string, path: string }` where `path` is relative to the skill
  directory (e.g. `references/foo.md`).

Output:

- `{ ok: true, name, path, content }` or `{ ok: false, error }`

Notes:

- Supported for:
  - filesystem skills (repo-bundled)
  - DB skills that include a bundle reference in `project_skills.metadata`
    (registry-installed; see SPEC-0028)
- Enforces strict path safety (no absolute paths, no `..`, must remain within
  skill directory) and size limits.

## Resolution Semantics

- Skills are resolved by **normalized name**: `trim().toLowerCase()`.
- DB skills override filesystem skills on name collision.

## Prompt Integration (Progressive Disclosure)

`buildSkillsPrompt(skills)` (`src/lib/ai/skills/prompt.ts`) generates a system
prompt fragment:

- includes up to 50 skills
- clamps description length
- instructs the agent to use `skills.load` and `skills.readFile`

Integration points:

- Chat workflow (`src/workflows/chat/project-chat.workflow.ts`):
  - resolves skills via a workflow step
  - appends skills prompt to mode system prompt
  - passes skill metadata via `experimental_context`
- Code Mode (`src/workflows/code-mode/steps/code-mode.step.ts`):
  - injects skills prompt via `prepareCall`
  - exposes tools `skills.load` and `skills.readFile` (read-only)
- Implementation planning (`src/workflows/runs/steps/implementation/planning.step.ts`):
  - injects skills prompt and exposes skills tools
  - optionally exposes Context7 tools when configured

## Deployment Considerations

Filesystem skills must be available in serverless output traces. This is
implemented in `next.config.ts` via:

- `outputFileTracingIncludes: { "/*": [".agents/skills/**/*", ".codex/skills/**/*"] }`

## UI/API

- UI: `GET /projects/:projectId/skills` (project tab)
- API: `src/app/api/skills/route.ts`
  - `GET /api/skills?projectId=...` (list DB skills)
  - `POST /api/skills` (upsert DB skill)
  - `DELETE /api/skills` (delete DB skill)
- Registry API: `src/app/api/skills/registry/*` (search/install/status)
  - See SPEC-0028 for registry install semantics and Blob bundles.

## Security

- Skills are treated as **untrusted text**:
  - no code execution in app runtime
  - no network access added by skills
- `skills.readFile` is read-only and path-confined.
- DB skills do not support file access unless they include a bundled ZIP
  reference (registry-installed; see SPEC-0028).

## Tests and Acceptance

### Tests

- `src/app/api/skills/__tests__/route.test.ts` (API contract)
- Tool allowlists and registry contract tests updated:
  - `src/lib/ai/tools/tool-ids.test.ts`
  - `src/lib/ai/tools/factory.server.test.ts`
  - `src/lib/ai/agents/modes/modes.test.ts`

### Acceptance gates

- `bun run format`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`

## Changelog

- **0.1 (2026-02-09)**: Initial version.
- **0.2 (2026-02-09)**: Added support for DB skills with bundled resources.
