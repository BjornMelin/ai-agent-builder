# Data Model

Defines canonical relational schema (Neon) and vector indexing model (Upstash
Vector).

## Relational entities (target)

- `projects`
- `project_files`
- `file_chunks`
- `runs`
- `run_steps`
- `artifacts`
- `chat_threads`
- `chat_messages`

## Schema locations (repo)

Drizzle is configured for:

- `src/db/schema.ts` (schema definitions)
- `src/db/migrations` (generated migrations)
- `drizzle.config.ts` (drizzle-kit configuration)

## Consistency and idempotency

- Neon is authoritative for metadata and artifact versioning.
- Upstash Vector is authoritative for similarity search results.
- Each ingestion run is idempotent per file using content hash (`sha256`) +
  extraction version.
- Each workflow step is idempotent per `(runId, stepName)`.

## Vector indexing

Namespaces:

- `project:{projectId}:chunks`
- `project:{projectId}:artifacts`

Vector metadata includes:

- `projectId`, `fileId`, `chunkId`, `sourceRef`, `createdAt`
- `type`: `chunk` | `artifact`
- `artifactKind`, `artifactVersion` (if applicable)

## Artifact versioning

Artifacts are versioned monotonically per logical key:

`(projectId, kind, logicalKey) -> version++`

## Required indexes (target)

- `project_files(project_id)`
- `file_chunks(project_id, file_id)`
- `runs(project_id)`
- `run_steps(run_id, step_name)`
- `artifacts(project_id, kind)`
- `chat_threads(project_id)`
- `chat_messages(thread_id, created_at)`
