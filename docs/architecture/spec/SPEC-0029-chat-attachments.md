---
spec: SPEC-0029
title: Project chat document attachments (AI Elements inline + upload-before-send)
version: 0.1.0
date: 2026-02-10
owners: ["Bjorn Melin"]
status: Implemented
related_requirements: ["FR-003", "FR-008", "FR-019", "PR-001", "NFR-008", "NFR-010", "IR-006"]
related_adrs: ["ADR-0030", "ADR-0011", "ADR-0009", "ADR-0026"]
related_specs: ["SPEC-0003", "SPEC-0004", "SPEC-0022", "SPEC-0023", "SPEC-0024"]
notes: "Adds first-class document attachments to Project Chat using vendored AI Elements components and a Vercel Blob client upload-before-send pipeline."
---

## Summary

Project Chat supports **document attachments** (PDF/DOCX/PPTX/XLSX/TXT/MD) end-to-end:

- Composer UI uses AI Elements `PromptInput` + `Attachments` (inline variant).[^ai-elements-attachments]
- Attachments are **uploaded before send** using Vercel Blob client uploads (`@vercel/blob/client upload()`), then registered/ingested via `POST /api/upload/register` (sync ingest by default).
- The durable multi-turn follow-up endpoint `POST /api/chat/:runId` accepts attachments in addition to text.
- Attachments persist in UI message history (DB) and are included in stream markers so resumes/replays can reconstruct user messages correctly.

## Scope

### In scope

- Document attachments in `/projects/[projectId]/chat`.
- Upload-before-send using Vercel Blob client uploads (supports files larger than Vercel server request limits).
- Multi-turn follow-ups with attachments via `POST /api/chat/:runId`.
- Resume-safe rendering: attachments appear for persisted messages and for user-message markers emitted in the assistant stream.

### Out of scope

- Image/video/audio attachments (future: vision, previews, transcoding).
- Per-attachment “processing/ready” UI state (sync ingest is assumed fast enough for this iteration).
- Signed URL proxying or private blob ACLs (Blob URLs are currently public).

## Requirements

Requirement IDs are defined in [docs/specs/requirements.md](/docs/specs/requirements.md).

- **FR-003:** Upload supported file types to a project.
- **FR-008:** Project-scoped multi-turn chat that can resume after disconnects.
- **FR-019:** Chat grounded in the project knowledge base built from uploads.
- **PR-001:** Streaming starts quickly (p95).
- **NFR-008:** Accessibility (keyboard + SR).
- **NFR-010:** CI quality gates (format/lint/typecheck/test/build).
- **IR-006:** File storage via Vercel Blob.

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.4 | 3.29 |
| Application value | 0.30 | 9.2 | 2.76 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.21 / 10.0

## Design

### UI: Composer + transcript

- Composer is built on `PromptInput` and keeps attachment state as `FileUIPart[]` (plus local `id` for UI list keys).[^ai-sdk-fileuipart]
- Composer also keeps the original `File` objects for upload-before-send (`rawFiles`) so we never re-read `blob:` URLs via `fetch(blob:)`.
- Composer renders `Attachments` with `variant="inline"` for a compact row above the textarea.[^ai-elements-attachments]
- Composer enforces basic client-side limits: `maxFileSize = budgets.maxUploadBytes` and `maxFiles = 5` per message (defense-in-depth UX guardrail).
- Transcript rendering groups `part.type === "file"` and renders them as inline chips above the message text.

### Client upload-before-send (hosted URLs)

1. PromptInput creates attachment parts with `url: blob:<object-url>`.
2. Before sending the chat message, the client:
   - uploads the original `File` objects to Vercel Blob using `@vercel/blob/client upload()` with `handleUploadUrl: "/api/upload"`
   - registers the uploaded blobs with `POST /api/upload/register` (which persists metadata and ingests)
3. The register response is mapped back to `FileUIPart[]` where:
   - `url` is the hosted Blob URL (no base64/data URL payloads).
   - `filename` and `mediaType` are preserved

Rationale:

- `FileUIPart.url` explicitly supports hosted URLs or data URLs.[^ai-sdk-fileuipart]
- Hosted URLs keep the chat payload small and avoid base64 memory spikes.

### PromptInput: URL conversion control (`fileUrlMode`)

Vendored `PromptInput` normally converts `blob:` URLs to `data:` URLs before submit.
This repo adds:

- `fileUrlMode?: "preserve" | "data-url"` (default: `"preserve"`)

`"preserve"` keeps blob URLs and enables the upload-before-send pipeline.
`"data-url"` is retained for demos/testing where sending data URLs directly is acceptable.

### Multi-turn follow-ups with attachments

When a durable chat session is active (`runId`):

- the client sends follow-ups via `POST /api/chat/:runId`
- request body supports `message?: string`, `files?: FileUIPart[]`, and always includes `messageId`
- validation requires at least one of `message` or `files`

The follow-up endpoint:

1. persists a user message with parts `[...,files, ...(message? text : [])]`
2. resumes the workflow hook with `{messageId, message?, files?}`

### Workflow: history projection vs model context

We persist file parts in UI history for user-visible context, but we do not pass file parts to the model for document types.

Instead, when projecting UI messages to model input:

- file parts are stripped
- a text hint is appended: `"[Attached files: ...]"` (filenames only)

Grounding happens via ingestion + retrieval (SPEC-0004); attachments are primarily an ingestion entrypoint, not a direct multimodal prompt channel.

### Resume-safe stream markers

The workflow writes `data-workflow` markers for user messages (including follow-ups).
Markers may include optional `files` so the client can reconstruct user messages even if the user message did not arrive as a standalone UI message before a refresh.

Marker shape:

```ts
type UserMessageMarker = {
  type: "user-message";
  id: string; // messageId
  content: string;
  files?: FileUIPart[];
  timestamp: number;
};
```

Client reconstruction:

- scans assistant message parts for `data-workflow` markers
- inserts a synthetic user message `{id, role:"user", parts:[...files, ...text]}` if that `id` is not already present in the raw UI messages

### API contracts

#### `POST /api/upload` (token exchange)

Used by Vercel Blob client uploads to exchange for a scoped client token. Inputs:

- JSON event (from `@vercel/blob/client upload()`):
  - `type: "blob.generate-client-token"`
  - `payload.pathname`
  - `payload.clientPayload` (JSON string containing `{projectId}`)

Outputs:

- `200 { clientToken: string }`

#### `POST /api/upload/register`

Used after Vercel Blob client uploads complete. Inputs:

- JSON body `{ projectId: string, async?: boolean, blobs: [{ url, originalName, contentType, size }] }`

Outputs:

- `200 { files: ProjectFileDto[] }` where each includes:
  - `name`, `mimeType`, `storageKey` (hosted Blob URL)

#### `POST /api/chat` (start session)

Chat start already accepts UI messages that may include `FileUIPart` parts.
The client uploads blobs first and sends hosted URLs as `FileUIPart.url`.

#### `POST /api/chat/:runId` (resume session)

Request JSON body:

```ts
type ResumeChatBody = {
  messageId: string;
  message?: string;
  files?: FileUIPart[];
};
```

Validation rule: at least one of `message` or `files` must be provided.

### File-level contracts

- UI composer + transcript: `src/app/(app)/projects/[projectId]/chat/chat-client.tsx`
- Upload helper: `src/lib/uploads/upload-files.client.ts`
- Prompt input attachment URL behavior: `src/components/ai-elements/prompt-input.tsx`
- Resume endpoint: `src/app/api/chat/[runId]/route.ts`
- Workflow hook schema: `src/workflows/chat/hooks/chat-message.ts`
- Durable workflow orchestration + markers: `src/workflows/chat/project-chat.workflow.ts`
- Marker writer: `src/workflows/chat/steps/writer.step.ts`

## Failure modes and mitigation

- Upload fails: surface composer error; do not clear text/attachments.
- Ingest slow: composer shows “uploading” state; if this becomes a UX issue, migrate to a hybrid or async ingest path (future).
- Run ended mid-follow-up: follow-up endpoint returns `404/409`; client clears `runId` and starts a new session on next send.
- Duplicate file uploads: `/api/upload/register` dedupes by content hash (sha256) and returns the existing DB record (SPEC-0003) while best-effort deleting the newly uploaded blob.

## Testing

- Route contract:
  - `POST /api/chat/:runId` accepts `files` and persists the UI message parts.
- Workflow contract:
  - hook schema accepts `{messageId, files}` without `message`.
  - user-message markers include files when present.
- UI:
  - transcript renders attachment chips for `FileUIPart` parts.

## References

[^ai-elements-attachments]: <https://elements.ai-sdk.dev/components/attachments.md>
[^ai-sdk-fileuipart]: <https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#fileuipart>
