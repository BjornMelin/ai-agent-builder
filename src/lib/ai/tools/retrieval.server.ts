import "server-only";

import { embedText } from "@/lib/ai/embeddings.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import { getRedis } from "@/lib/upstash/redis.server";
import {
  getVectorIndex,
  projectChunksNamespace,
  type VectorMetadata,
} from "@/lib/upstash/vector.server";

/**
 * A single retrieval result with score, snippet, and provenance metadata.
 */
export type RetrievalHit = Readonly<{
  id: string;
  score: number;
  snippet: string;
  provenance: Readonly<{
    type: "chunk";
    projectId: string;
    fileId: string;
    chunkIndex: number;
    pageStart?: number;
    pageEnd?: number;
  }>;
}>;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getRedisOptional() {
  try {
    return getRedis();
  } catch {
    return null;
  }
}

function cacheKey(
  input: Readonly<{ projectId: string; q: string; topK: number }>,
): string {
  const payload = JSON.stringify({
    projectId: input.projectId,
    q: input.q.trim().toLowerCase(),
    topK: input.topK,
  });
  return `cache:retrieval:${sha256Hex(payload)}`;
}

/**
 * Retrieve relevant chunks for a project using Upstash Vector.
 *
 * @param input - Retrieval input.
 * @returns Retrieval hits with provenance for citations.
 */
export async function retrieveProjectChunks(
  input: Readonly<{ projectId: string; q: string; topK?: number }>,
): Promise<readonly RetrievalHit[]> {
  if (!uuidRegex.test(input.projectId)) {
    throw new AppError("bad_request", 400, "Invalid projectId format.");
  }

  const topK = input.topK ?? budgets.maxVectorTopK;
  if (topK < 1 || topK > budgets.maxVectorTopK) {
    throw new AppError(
      "bad_request",
      400,
      `topK must be between 1 and ${budgets.maxVectorTopK}.`,
    );
  }

  const redis = getRedisOptional();
  const key = cacheKey({ projectId: input.projectId, q: input.q, topK });

  if (redis) {
    const cached = await redis.get<readonly RetrievalHit[]>(key);
    if (cached) return cached;
  }

  const embedding = await embedText(input.q);
  const namespace = projectChunksNamespace(input.projectId);
  const vector = getVectorIndex().namespace(namespace);

  const results = await vector.query<VectorMetadata>({
    filter: `projectId = '${input.projectId}' AND type = 'chunk'`,
    includeMetadata: true,
    topK,
    vector: embedding,
  });

  const hits: RetrievalHit[] = results.flatMap((r) => {
    const meta = r.metadata;
    if (!meta || meta.type !== "chunk") return [];

    const provenance: RetrievalHit["provenance"] = {
      chunkIndex: meta.chunkIndex,
      fileId: meta.fileId,
      projectId: meta.projectId,
      type: "chunk",
      ...(meta.pageStart === undefined ? {} : { pageStart: meta.pageStart }),
      ...(meta.pageEnd === undefined ? {} : { pageEnd: meta.pageEnd }),
    };

    return [
      {
        id: String(r.id),
        provenance,
        score: r.score,
        snippet: meta.snippet ?? "",
      },
    ];
  });

  if (redis) {
    // Cache write is best-effort; don't fail the request if Redis is unavailable.
    await redis.setex(key, budgets.toolCacheTtlSeconds, hits).catch(() => {
      // Silently ignore cache write failures.
    });
  }

  return hits;
}
