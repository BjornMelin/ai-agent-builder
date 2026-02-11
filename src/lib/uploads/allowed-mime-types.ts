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

export const allowedUploadMimeTypeSet = new Set<string>(allowedUploadMimeTypes);
