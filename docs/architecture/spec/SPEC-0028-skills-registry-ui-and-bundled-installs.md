---
spec: SPEC-0028
title: Skills registry integration (skills.sh) + UI installs with bundled resources
version: 0.1.0
date: 2026-02-09
owners: ["Bjorn Melin"]
status: Implemented
related_requirements: ["FR-035", "FR-036", "FR-037", "NFR-001", "NFR-006", "NFR-013", "NFR-014", "NFR-016", "IR-006", "IR-011"]
related_adrs: ["ADR-0029", "ADR-0028", "ADR-0010", "ADR-0013", "ADR-0026"]
related_specs: ["SPEC-0027", "SPEC-0009", "SPEC-0022"]
notes: "Add a project-scoped skills registry UX (search + install/update/uninstall) powered by skills.sh search and GitHub archive ingestion, storing installed skills in DB with bundled files for skills.readFile."
---

## Summary

This spec adds a **skills registry UI** to the project Skills tab so users can:

- Search skills in the public **skills.sh** registry.[^skills-sh-docs][^skills-sh-api-search]
- Install/update/uninstall a registry skill into a **single project**.

Registry-installed skills are persisted as **project DB skills** (highest
precedence) and include a bundled ZIP snapshot uploaded to **Vercel Blob** so
`skills.readFile` works for those DB skills without requiring filesystem access
or running `npx skills` in production.

## Scope

### In scope

- Registry search in UI and API via `skills.sh/api/search`.[^skills-sh-api-search]
- Project-scoped registry installs:
  - Download skill source from GitHub via repository archive ZIP.
  - Resolve the requested skill by scanning `**/SKILL.md` and matching
    frontmatter `name` to the registry `skillId`.
  - Create a **bundle ZIP** containing all files under the resolved skill
    directory.
  - Upload bundle ZIP to Vercel Blob and store the returned blob pathname in DB
    metadata (server-only).
  - Upsert `project_skills` row with `name`, `description`, and full `SKILL.md`
    content.
- Uninstall deletes the DB row and best-effort deletes the associated Blob.
- `skills.readFile` supports:
  - repo-bundled filesystem skills
  - DB skills that include a bundle reference in `project_skills.metadata`

### Out of scope

- Executing skill-bundled scripts in the app runtime.
- Global per-user skill libraries or marketplace sharing.
- Version pinning/semantic upgrades (future: show “update available”).

## Architecture

### High-level flow

1. UI calls `GET /api/skills/registry/search` (skills.sh search).
2. UI calls `POST /api/skills/registry/install` for a chosen registry ID.
3. Server starts a **Workflow DevKit** run to perform install in a durable
   workflow.
4. UI polls `GET /api/skills/registry/status` until the run completes.
5. On success, UI refreshes and the new skill appears as a project skill.

### Durable install (Workflow DevKit)

Workflow function:

- `src/workflows/skills-registry/project-skill-registry.workflow.ts`

Step implementation (Node access, retryable):

- `src/workflows/skills-registry/steps/install-project-skill-from-registry.step.ts`

The step performs:

1. Parse `registryId` (`owner/repo/skillId`).
2. Download GitHub archive ZIP (branch fallback `main` → `master`).
3. Resolve the requested skill (`resolveRegistrySkillFromRepoZip`).
4. Build a bundle ZIP and upload to Blob.
5. Upsert DB skill with metadata:
   - `metadata.registry`: `{id, source, skillId}`
   - `metadata.bundle`: `{blobPath, format: "zip-v1", fileCount, sizeBytes}`
6. Best-effort delete a previous bundle Blob if updating an existing skill.

### Data contracts

#### `project_skills.metadata` (server-only)

- `registry` (optional): `owner/repo/skillId`
- `bundle` (optional): Blob pathname + bundle stats

This metadata must never be sent to the client because Blob URLs/pathnames are
sensitive even when public.

### Security & guardrails

- No `npx skills` execution in production; installs are done by downloading and
  extracting `SKILL.md` content from GitHub archives.[^skills-sh-cli][^vercel-labs-skills]
- Strict size caps:
  - Repo archive max bytes
  - Bundle file count + total bytes
  - `skills.readFile` max file size
- Redaction:
  - `GET /api/skills` and server components map DB rows to **public DTOs**
    excluding `metadata`.

## UI/UX

Project Skills tab (`/projects/:projectId/skills`) gains two tabs:

- **Installed**: manual DB skills and registry-installed DB skills.
- **Registry**: search skills.sh and install/update/uninstall.

## Testing

- Unit: `resolveRegistrySkillFromRepoZip` bundles the expected files.
- API:
  - `GET /api/skills/registry/search` annotates install state
  - `POST /api/skills/registry/install` starts workflow and returns `runId`
  - `GET /api/skills/registry/status` returns workflow status
- Regression: `/api/skills` does not leak `metadata` fields.

## Acceptance criteria

- Users can search registry skills and start an install from the UI.
- Installed registry skills appear as project skills and override repo skills.
- `skills.readFile` works for:
  - filesystem skills
  - registry-installed DB skills with bundles
- Blob URL/pathnames never appear in client payloads.

## References

[^skills-sh-docs]: <https://skills.sh/docs>
[^skills-sh-cli]: <https://skills.sh/docs/cli>
[^skills-sh-api-search]: <https://skills.sh/api/search>
[^vercel-labs-skills]: <https://github.com/vercel-labs/skills>

## Changelog

- **0.1 (2026-02-09)**: Initial version. Implemented.
