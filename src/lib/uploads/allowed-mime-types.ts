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
 * File extensions accepted by the upload picker UI.
 *
 * @remarks
 * Keep extension and MIME allow-lists aligned.
 */
export const allowedUploadExtensions = [
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".txt",
  ".md",
] as const;

/**
 * Comma-delimited `accept` value for file-input controls.
 */
export const defaultUploadAcceptList = [
  ...allowedUploadExtensions,
  ...allowedUploadMimeTypes,
].join(",");

/**
 * Comma-delimited `accept` value for file-input controls.
 */
export const uploadAcceptList = defaultUploadAcceptList;

/**
 * Maximum number of files accepted per upload action.
 */
export const defaultUploadMaxFiles = 5;

/**
 * Maximum number of files accepted per upload action.
 */
export const uploadMaxFiles = defaultUploadMaxFiles;

/**
 * Provides a set view of allowed upload MIME types for fast membership checks.
 */
export const allowedUploadMimeTypeSet = new Set<string>(allowedUploadMimeTypes);
