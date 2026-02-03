import "server-only";

/**
 * A stable reference to a subsection of an extracted document (page/slide/sheet).
 */
export type ExtractedRef = string;

/**
 * A single extracted section of text with provenance.
 */
export type ExtractedSection = Readonly<{
  ref: ExtractedRef;
  text: string;
  meta?: Readonly<Record<string, unknown>>;
}>;

/**
 * Normalized extracted document model.
 *
 * Source of truth: docs/architecture/spec/SPEC-0003-upload-ingestion-pipeline.md
 */
export type ExtractedDoc = Readonly<{
  fileId: string;
  mimeType: string;
  name: string;
  sections: readonly ExtractedSection[];
}>;

/**
 * A deterministic chunk used for retrieval and indexing.
 */
export type Chunk = Readonly<{
  id: string;
  projectId: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  pageStart?: number;
  pageEnd?: number;
  tokenCount?: number;
}>;
