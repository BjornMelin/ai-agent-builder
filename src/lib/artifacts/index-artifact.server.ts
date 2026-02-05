import "server-only";

import { embedTexts } from "@/lib/ai/embeddings.server";
import { getMarkdownContent } from "@/lib/artifacts/content.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import { getArtifactById } from "@/lib/data/artifacts.server";
import {
  getVectorIndex,
  projectArtifactsNamespace,
  type VectorMetadata,
} from "@/lib/upstash/vector.server";

type ArtifactIndexInput = Readonly<{
  projectId: string;
  artifactId: string;
  kind: string;
  logicalKey: string;
  version: number;
}>;

type IndexedChunk = Readonly<{
  id: string;
  chunkIndex: number;
  text: string;
  snippet: string;
}>;

function normalizeText(value: string): string {
  return value.replaceAll(/\r\n/g, "\n").trim();
}

function toSnippet(text: string): string {
  const normalized = normalizeText(text).replaceAll(/\s+/g, " ").trim();
  return normalized.length > 240 ? `${normalized.slice(0, 240)}…` : normalized;
}

function chunkMarkdown(markdown: string): readonly string[] {
  const normalized = normalizeText(markdown);
  if (normalized.length === 0) return [];

  // Guardrail: avoid indexing extremely large documents without explicit intent.
  const capped = normalized.slice(0, 80_000);

  const paras = capped
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const target = 1_800;
  const overlap = 200;

  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    const out = buffer.trim();
    if (out.length > 0) chunks.push(out);
    buffer = "";
  };

  for (const p of paras) {
    if (buffer.length === 0) {
      buffer = p;
      continue;
    }

    if (buffer.length + 2 + p.length <= target) {
      buffer = `${buffer}\n\n${p}`;
      continue;
    }

    flush();
    buffer = p;
  }

  flush();

  // Apply simple overlap to improve continuity.
  if (chunks.length <= 1) return chunks;

  const withOverlap: string[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const current = chunks[i];
    if (!current) continue;
    const prevTail =
      i === 0 ? "" : (chunks[i - 1]?.slice(-overlap).trim() ?? "");
    const combined =
      prevTail.length > 0 ? `${prevTail}\n\n${current}` : current;
    withOverlap.push(combined);
  }

  return withOverlap;
}

function buildChunkIds(
  baseId: string,
  texts: readonly string[],
): readonly IndexedChunk[] {
  return texts.map((text, idx) => ({
    chunkIndex: idx,
    id: `${baseId}:${idx}`,
    snippet: toSnippet(text),
    text,
  }));
}

/**
 * Index an artifact version into Upstash Vector (latest-only replacement strategy).
 *
 * @remarks
 * This function replaces all vectors for the same `(projectId, kind, logicalKey)`
 * by deleting the deterministic chunk-id prefix before upserting the latest chunks.
 *
 * @param input - Artifact index input.
 * @throws AppError - When the artifact cannot be found or does not match the input.
 */
export async function indexArtifactVersion(
  input: ArtifactIndexInput,
): Promise<void> {
  const artifact = await getArtifactById(input.artifactId);
  if (!artifact || artifact.projectId !== input.projectId) {
    throw new AppError("not_found", 404, "Artifact not found.");
  }

  if (
    artifact.kind !== input.kind ||
    artifact.logicalKey !== input.logicalKey ||
    artifact.version !== input.version
  ) {
    // Stale job (artifact was replaced/version bumped). Treat as a no-op.
    return;
  }

  const baseId = sha256Hex(
    `${artifact.projectId}:${artifact.kind}:${artifact.logicalKey}`,
  );
  const namespace = projectArtifactsNamespace(artifact.projectId);
  const vector = getVectorIndex().namespace(namespace);
  const chunkIdPrefix = `${baseId}:`;

  // Cleanup first so shrinking chunk sets never leave stale vectors behind.
  await vector.delete({ prefix: chunkIdPrefix });

  const markdown = getMarkdownContent(artifact.content);
  if (!markdown) {
    // Only markdown artifacts are indexed for retrieval today.
    return;
  }

  const texts = chunkMarkdown(`${markdown.title}\n\n${markdown.markdown}`);
  const limited = texts.slice(0, budgets.maxEmbedBatchSize);
  if (limited.length === 0) return;

  const chunks = buildChunkIds(baseId, limited);

  const embeddings = await embedTexts(
    chunks.map((c) => c.text),
    { maxParallelCalls: 2 },
  );

  await vector.upsert(
    chunks.map((c, idx) => {
      const meta: VectorMetadata = {
        artifactId: artifact.id,
        artifactKey: artifact.logicalKey,
        artifactKind: artifact.kind,
        artifactVersion: artifact.version,
        // Extra fields for UI/search convenience (allowed via VectorDict).
        chunkIndex: c.chunkIndex,
        projectId: artifact.projectId,
        snippet: c.snippet,
        title: markdown.title,
        type: "artifact",
      };

      return {
        data: c.text,
        id: c.id,
        metadata: meta,
        vector: embeddings[idx] ?? [],
      };
    }),
  );
}
