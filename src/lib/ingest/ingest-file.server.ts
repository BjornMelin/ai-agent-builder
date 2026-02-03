import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { embedTexts } from "@/lib/ai/embeddings.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { chunkDocument } from "@/lib/ingest/chunk/chunk-document.server";
import { extractDocument } from "@/lib/ingest/extract/extract-document.server";
import {
  getVectorIndex,
  projectChunksNamespace,
} from "@/lib/upstash/vector.server";

/**
 * Result of a file ingestion operation.
 *
 * @property fileId - Ingested file identifier.
 * @property chunksIndexed - Number of chunks indexed.
 */
export type IngestFileResult = Readonly<{
  fileId: string;
  chunksIndexed: number;
}>;

/**
 * Ingest a stored file: extract → chunk → embed → persist chunks → index vectors.
 *
 * This is designed to run either inline (small files) or in a QStash worker
 * Route Handler (async ingestion).
 *
 * @param input - File metadata and content bytes for ingestion.
 * @returns Ingestion result.
 * @throws AppError - When no chunks are produced from extraction (400).
 * @throws AppError - When embedding batch size doesn't match chunk count (500).
 */
export async function ingestFile(
  input: Readonly<{
    projectId: string;
    fileId: string;
    name: string;
    mimeType: string;
    bytes: Uint8Array;
  }>,
): Promise<IngestFileResult> {
  const extracted = await extractDocument({
    bytes: input.bytes,
    fileId: input.fileId,
    mimeType: input.mimeType,
    name: input.name,
  });

  const chunks = chunkDocument({ extracted, projectId: input.projectId });
  if (chunks.length === 0) {
    throw new AppError("ingest_failed", 400, "No chunks were produced.");
  }

  const texts = chunks.map((c) => c.content);
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += budgets.maxEmbedBatchSize) {
    const batch = texts.slice(i, i + budgets.maxEmbedBatchSize);
    const batchEmbeddings = await embedTexts(batch, { maxParallelCalls: 2 });
    embeddings.push(...batchEmbeddings);
  }

  if (embeddings.length !== chunks.length) {
    throw new AppError("embed_failed", 500, "Embedding batch size mismatch.");
  }

  const db = getDb();
  const vector = getVectorIndex().namespace(
    projectChunksNamespace(input.projectId),
  );

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.fileChunksTable)
      .where(eq(schema.fileChunksTable.fileId, input.fileId));

    await tx.insert(schema.fileChunksTable).values(
      chunks.map((c) => ({
        chunkIndex: c.chunkIndex,
        content: c.content,
        contentHash: c.contentHash,
        fileId: c.fileId,
        pageEnd: c.pageEnd,
        pageStart: c.pageStart,
        projectId: c.projectId,
        tokenCount: c.tokenCount ?? null,
      })),
    );
  });

  // Ensure stale vectors are removed (e.g., extraction version changes).
  try {
    await vector.delete({ prefix: `${input.fileId}:` });

    await vector.upsert(
      chunks.map((c, idx) => ({
        id: c.id,
        metadata: {
          chunkId: c.id,
          chunkIndex: c.chunkIndex,
          fileId: input.fileId,
          projectId: input.projectId,
          snippet: c.content.slice(0, 280),
          type: "chunk",
          ...(c.pageStart === undefined ? {} : { pageStart: c.pageStart }),
          ...(c.pageEnd === undefined ? {} : { pageEnd: c.pageEnd }),
        },
        vector: embeddings[idx] as number[],
      })),
    );
  } catch (error) {
    await db
      .delete(schema.fileChunksTable)
      .where(eq(schema.fileChunksTable.fileId, input.fileId));
    throw error;
  }

  return { chunksIndexed: chunks.length, fileId: input.fileId };
}
