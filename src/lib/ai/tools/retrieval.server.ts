import "server-only";

import { embedText } from "@/lib/ai/embeddings.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import { getRedis } from "@/lib/upstash/redis.server";
import {
  getVectorIndex,
  projectArtifactsNamespace,
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

/**
 * A single artifact retrieval result with score, snippet, and provenance metadata.
 */
export type ArtifactRetrievalHit = Readonly<{
  id: string;
  score: number;
  title: string;
  snippet: string;
  provenance: Readonly<{
    type: "artifact";
    projectId: string;
    artifactId: string;
    kind: string;
    logicalKey: string;
    version: number;
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

function cacheKeyArtifacts(
  input: Readonly<{ projectId: string; q: string; topK: number }>,
): string {
  const payload = JSON.stringify({
    projectId: input.projectId,
    q: input.q.trim().toLowerCase(),
    topK: input.topK,
    type: "artifact",
  });
  return `cache:retrieval:artifacts:${sha256Hex(payload)}`;
}

/**
 * Retrieve relevant chunks for a project using Upstash Vector.
 *
 * @param input - Retrieval input.
 * @returns Retrieval hits with provenance for citations.
 * @throws AppError - When projectId is not a UUID or topK is out of range.
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

function extractStringField(
  meta: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = meta[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

type ArtifactHitCandidate = Readonly<{
  hit: ArtifactRetrievalHit;
  logicalArtifactKey: string;
  version: number;
}>;

/**
 * Retrieve relevant artifacts for a project using Upstash Vector.
 *
 * @param input - Retrieval input.
 * @returns Artifact retrieval hits with provenance and deep-linkable identifiers.
 * @throws AppError - When projectId is not a UUID or topK is out of range.
 */
export async function retrieveProjectArtifacts(
  input: Readonly<{ projectId: string; q: string; topK?: number }>,
): Promise<readonly ArtifactRetrievalHit[]> {
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
  const key = cacheKeyArtifacts({
    projectId: input.projectId,
    q: input.q,
    topK,
  });

  if (redis) {
    const cached = await redis.get<readonly ArtifactRetrievalHit[]>(key);
    if (cached) return cached;
  }

  const embedding = await embedText(input.q);
  const namespace = projectArtifactsNamespace(input.projectId);
  const vector = getVectorIndex().namespace(namespace);
  const queryTopK = Math.min(budgets.maxVectorTopK, Math.max(topK, topK * 3));

  const results = await vector.query<VectorMetadata>({
    filter: `projectId = '${input.projectId}' AND type = 'artifact'`,
    includeMetadata: true,
    topK: queryTopK,
    vector: embedding,
  });

  const candidates: ArtifactHitCandidate[] = results.flatMap((r) => {
    const meta = r.metadata;
    if (!meta || meta.type !== "artifact") return [];

    if (r.id === null || r.id === undefined) return [];

    const artifactId = extractStringField(meta, "artifactId");
    const artifactKind = extractStringField(meta, "artifactKind");
    const artifactKey = extractStringField(meta, "artifactKey");
    const projectId = extractStringField(meta, "projectId");
    const version =
      typeof meta.artifactVersion === "number" &&
      Number.isFinite(meta.artifactVersion)
        ? meta.artifactVersion
        : null;

    if (
      !artifactId ||
      !artifactKind ||
      !artifactKey ||
      !projectId ||
      version === null
    ) {
      return [];
    }

    const title =
      extractStringField(meta, "title") ??
      `${artifactKind} ${artifactKey} v${version}`;
    const snippet = extractStringField(meta, "snippet") ?? "";

    const provenance: ArtifactRetrievalHit["provenance"] = {
      artifactId,
      kind: artifactKind,
      logicalKey: artifactKey,
      projectId,
      type: "artifact",
      version,
    };

    const hit: ArtifactRetrievalHit = {
      id: String(r.id),
      provenance,
      score: r.score,
      snippet,
      title,
    };

    return [
      {
        hit,
        logicalArtifactKey: `${artifactKind}:${artifactKey}`,
        version,
      },
    ];
  });

  const latestVersionByKey = new Map<string, number>();
  for (const candidate of candidates) {
    const existing = latestVersionByKey.get(candidate.logicalArtifactKey);
    if (existing === undefined || candidate.version > existing) {
      latestVersionByKey.set(candidate.logicalArtifactKey, candidate.version);
    }
  }

  const bestHitByKey = new Map<string, ArtifactRetrievalHit>();
  for (const candidate of candidates) {
    const latest = latestVersionByKey.get(candidate.logicalArtifactKey);
    if (latest !== candidate.version) continue;

    const existing = bestHitByKey.get(candidate.logicalArtifactKey);
    if (!existing || candidate.hit.score > existing.score) {
      bestHitByKey.set(candidate.logicalArtifactKey, candidate.hit);
    }
  }

  const hits = [...bestHitByKey.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (redis) {
    await redis.setex(key, budgets.toolCacheTtlSeconds, hits).catch(() => {
      // Ignore cache write failures.
    });
  }

  return hits;
}
