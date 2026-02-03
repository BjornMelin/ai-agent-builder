import "server-only";

import { Index } from "@upstash/vector";

import { env } from "@/lib/env";

type VectorDict = Readonly<Record<string, unknown>>;

/**
 * Vector metadata shape for all indexed content in Upstash Vector.
 *
 * Source of truth: docs/architecture/data-model.md (Vector indexing section).
 */
export type VectorMetadata =
  | (VectorDict &
      Readonly<{
        projectId: string;
        type: "chunk";
        fileId: string;
        chunkId: string;
        chunkIndex: number;
        snippet?: string;
        pageStart?: number;
        pageEnd?: number;
      }>)
  | (VectorDict &
      Readonly<{
        projectId: string;
        type: "artifact";
        artifactId: string;
        artifactKind: string;
        artifactKey: string;
        artifactVersion: number;
      }>)
  | (VectorDict &
      Readonly<{
        projectId: string;
        type: "code";
        repoId: string;
        path: string;
        commitSha: string;
        language?: string;
      }>);

let cachedVectorIndex: Index<VectorMetadata> | undefined;

/**
 * Lazily create and cache a single Upstash Vector client.
 *
 * This avoids `Index.fromEnv()` (direct `process.env` access) and ensures env
 * validation happens at the first usage site.
 *
 * @returns Upstash Vector index client.
 */
export function getVectorIndex(): Index<VectorMetadata> {
  cachedVectorIndex ??= new Index<VectorMetadata>({
    token: env.upstash.vectorRestToken,
    url: env.upstash.vectorRestUrl,
  });

  return cachedVectorIndex;
}

/**
 * Namespace for uploaded file chunks in a project.
 *
 * @param projectId - Project ID.
 * @returns Upstash Vector namespace.
 */
export function projectChunksNamespace(projectId: string): string {
  return `project:${projectId}:chunks`;
}

/**
 * Namespace for generated artifacts in a project.
 *
 * @param projectId - Project ID.
 * @returns Upstash Vector namespace.
 */
export function projectArtifactsNamespace(projectId: string): string {
  return `project:${projectId}:artifacts`;
}

/**
 * Namespace for connected repository code chunks in a project.
 *
 * @param projectId - Project ID.
 * @param repoId - Repository ID.
 * @returns Upstash Vector namespace.
 */
export function projectRepoNamespace(
  projectId: string,
  repoId: string,
): string {
  return `project:${projectId}:repo:${repoId}`;
}
