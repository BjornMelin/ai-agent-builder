/**
 * MIME types supported for project uploads and ingestion.
 *
 * @remarks
 * Keep this list in sync with ingestion pipelines and any client-side accept lists.
 */
export const allowedUploadMimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
] as const;

/**
 * Provides a set view of allowed upload MIME types for fast membership checks.
 */
export const allowedUploadMimeTypeSet = new Set<string>(allowedUploadMimeTypes);
