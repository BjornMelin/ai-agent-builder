import "server-only";

import { sha256Hex } from "@/lib/core/sha256";
import type { Chunk, ExtractedDoc } from "@/lib/ingest/types";

function estimateTokens(text: string): number {
  // Heuristic token estimate; replace with a model tokenizer if precise budgets are required.
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

function splitByMaxChars(text: string, maxChars: number): string[] {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + maxChars, normalized.length);
    // Prefer breaking on a sentence boundary if available.
    const window = normalized.slice(start, end);
    const lastBreak = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("\n"),
    );
    const cut = lastBreak > maxChars * 0.6 ? start + lastBreak + 1 : end;
    chunks.push(normalized.slice(start, cut).trim());
    start = cut;
  }
  return chunks.filter((c) => c.length > 0);
}

function parsePageRef(ref: string): number | null {
  const match = ref.match(/^page:(\d+)$/);
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isFinite(page) ? page : null;
}

/**
 * Chunk an extracted document deterministically.
 *
 * This produces stable chunk IDs and content hashes for idempotent indexing.
 *
 * @param input - Chunking input.
 * @returns Deterministic chunks.
 */
export function chunkDocument(
  input: Readonly<{
    extracted: ExtractedDoc;
    projectId: string;
    maxCharsPerChunk?: number;
  }>,
): readonly Chunk[] {
  const maxChars = input.maxCharsPerChunk ?? 2400;

  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of input.extracted.sections) {
    const page = parsePageRef(section.ref);
    const parts = splitByMaxChars(section.text, maxChars);

    for (const part of parts) {
      const contentHash = sha256Hex(part);
      const id = `${input.extracted.fileId}:${chunkIndex}`;
      const tokenCount = estimateTokens(part);

      chunks.push({
        chunkIndex,
        content: part,
        contentHash,
        fileId: input.extracted.fileId,
        id,
        ...(page === null ? {} : { pageEnd: page, pageStart: page }),
        projectId: input.projectId,
        tokenCount,
      });

      chunkIndex += 1;
    }
  }

  return chunks;
}
