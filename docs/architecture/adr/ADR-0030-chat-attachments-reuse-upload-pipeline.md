---
ADR: 0030
Title: Chat attachments reuse /api/upload pipeline (hosted URLs + inline AI Elements)
Status: Implemented
Version: 0.1
Date: 2026-02-10
Supersedes: []
Superseded-by: []
Related: [ADR-0011, ADR-0009, ADR-0006, ADR-0026]
Tags: [chat, attachments, ai-elements, ai-sdk, upload, ingestion, workflow]
Related-Requirements: [FR-003, FR-008, FR-019, PR-001, NFR-008, NFR-010, IR-006]
References:
  - [AI Elements attachments](https://elements.ai-sdk.dev/components/attachments.md)
  - [AI SDK useChat attachments](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot#attachments)
  - [AI SDK FileUIPart](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#fileuipart)
---

## Status

Implemented — 2026-02-10.

## Context

Project Chat is the primary UX for interacting with a project knowledge base.
We already support:

- uploading documents to a project (stored in Blob, ingested, indexed)
- multi-turn durable chat sessions (Workflow DevKit)
- AI Elements primitives for chat UI

We need first-class **document attachments** in chat so users can:

1. attach a file in the chat composer
2. have it ingested for RAG grounding
3. see the attachment in message history
4. attach files in follow-up messages during an active durable chat run

## Decision Drivers

- Reuse the existing, validated upload + ingestion pipeline (`POST /api/upload`).
- Avoid base64/data URL message payloads for performance and reliability.
- Preserve resume-safe chat history (stream markers + persisted UI messages).
- Keep model prompts clean; rely on ingestion + retrieval for documents.
- Minimize new endpoints and contracts; strict TypeScript + Zod validation.

## Alternatives Considered

### A. Embed attachments directly as data URLs in chat requests

Pros:

- Single request; no separate upload call.

Cons:

- Large payloads, memory pressure, and brittle streaming on non-trivial docs.
- Harder to persist and replay reliably.

### B. Create a dedicated chat upload endpoint (`/api/chat/upload`)

Pros:

- Chat-specific contract could include `messageId`, status, etc.

Cons:

- Duplicates the existing allowlist/ingest/dedupe pipeline.
- Adds long-term maintenance surface area for minimal value.

### C. Reuse `POST /api/upload` and send hosted file URLs as `FileUIPart` (**Chosen**)

Pros:

- One canonical ingestion path for the whole app.
- Hosted URLs keep chat payloads small; `FileUIPart.url` supports hosted URLs.[^ai-sdk-fileuipart]
- Clean separation: upload/ingest first, then chat.
- Works for follow-ups by extending `POST /api/chat/:runId` contract.

Cons:

- Sync ingest can add latency; may need a hybrid/async ingest UX later.
- Blob URLs are public; requires care around lifecycle/cleanup (future).

### D. Stream multipart upload through the chat streaming endpoint

Pros:

- Single action; can stream progress inline.

Cons:

- High complexity (multipart streaming + retries + partial failure handling).
- Not needed for docs-only scope.

## Decision Framework (must be ≥ 9.0)

Weights:

- Solution leverage: 35%
- Application value: 30%
- Maintenance and cognitive load: 25%
- Architectural adaptability: 10%

| Option | Leverage | Value | Maintenance | Adaptability | Weighted total |
| --- | ---: | ---: | ---: | ---: | ---: |
| A. Data URLs in chat | 6.8 | 7.4 | 5.8 | 7.2 | 6.79 |
| B. Dedicated chat upload endpoint | 7.2 | 8.1 | 7.0 | 8.0 | 7.46 |
| C. Reuse `/api/upload` + hosted URLs | 9.4 | 9.2 | 8.9 | 9.0 | **9.19** |
| D. Multipart streaming upload | 6.4 | 8.0 | 4.2 | 8.6 | 6.63 |

## Decision

Implement chat attachments as:

1. Composer uses vendored AI Elements `PromptInput` attachments + `Attachments` inline UI.[^ai-elements-attachments]
2. Client uploads attachments before send via `POST /api/upload` (sync ingest).
3. Client sends the chat message using hosted file URLs (no data URLs) as `FileUIPart[]` alongside text.
4. Extend durable follow-ups: `POST /api/chat/:runId` accepts `files?: FileUIPart[]` and resumes the workflow hook with attachments.
5. Persist file parts in UI message history and include them in `data-workflow` user-message markers for resume-safe replay.
6. Do not pass document file parts to the model directly; strip file parts when building model messages and append a filename note, relying on ingestion + retrieval (SPEC-0004).

Implementation details and contracts are specified in:

- [SPEC-0029](../spec/SPEC-0029-chat-attachments.md)

## Consequences

### Positive outcomes

- Users can attach documents in chat and see them in history.
- Attachments in follow-ups work during active durable sessions.
- Upload/ingestion remains canonical and deduped.
- Chat payloads remain small and stream-resume-safe.

### Negative outcomes / risks

- Sync ingest can add noticeable latency for large docs.
  - Mitigation: keep strict upload budgets; consider a hybrid or async ingest UX if needed.
- Public blob URLs can be shared out-of-band.
  - Mitigation: keep app access private; consider signed URLs or authenticated proxying in a future hardening pass.
- Orphaned uploads if the user abandons mid-flow.
  - Mitigation (future): add cleanup/GC for unattached uploads or reference counting by project.

## References

[^ai-elements-attachments]: <https://elements.ai-sdk.dev/components/attachments.md>
[^ai-sdk-fileuipart]: <https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#fileuipart>
