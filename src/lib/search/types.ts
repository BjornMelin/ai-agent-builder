/**
 * Search scopes accepted by the search API.
 */
export const SEARCH_SCOPES = ["global", "project"] as const;

/**
 * Search result domain filters accepted by the search API.
 */
export const SEARCH_TYPE_FILTERS = [
  "projects",
  "uploads",
  "chunks",
  "artifacts",
  "runs",
] as const;

/**
 * Search scope value.
 */
export type SearchScope = (typeof SEARCH_SCOPES)[number];

/**
 * Search domain filter value.
 */
export type SearchTypeFilter = (typeof SEARCH_TYPE_FILTERS)[number];

/**
 * Project search result.
 */
export type ProjectSearchResult = Readonly<{
  type: "project";
  id: string;
  title: string;
  href: string;
}>;

/**
 * Upload search result.
 */
export type UploadSearchResult = Readonly<{
  type: "upload";
  id: string;
  title: string;
  snippet: string;
  href: string;
  provenance: Readonly<{
    projectId: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}>;

/**
 * Chunk search result.
 */
export type ChunkSearchResult = Readonly<{
  type: "chunk";
  id: string;
  score: number;
  title: string;
  snippet: string;
  href: string;
  provenance: Readonly<{
    projectId: string;
    fileId: string;
    chunkIndex: number;
    pageStart: number | undefined;
    pageEnd: number | undefined;
  }>;
}>;

/**
 * Artifact search result.
 */
export type ArtifactSearchResult = Readonly<{
  type: "artifact";
  id: string;
  score: number;
  title: string;
  snippet: string;
  href: string;
  provenance: Readonly<{
    projectId: string;
    artifactId: string;
    kind: string;
    logicalKey: string;
    version: number;
  }>;
}>;

/**
 * Run search result.
 */
export type RunSearchResult = Readonly<{
  type: "run";
  id: string;
  title: string;
  snippet: string;
  href: string;
  provenance: Readonly<{
    projectId: string;
    kind: "research" | "implementation";
    status:
      | "pending"
      | "running"
      | "waiting"
      | "blocked"
      | "succeeded"
      | "failed"
      | "canceled";
  }>;
}>;

/**
 * Union of all supported search result shapes.
 */
export type SearchResult =
  | ProjectSearchResult
  | UploadSearchResult
  | ChunkSearchResult
  | ArtifactSearchResult
  | RunSearchResult;

/**
 * Search API response payload.
 */
export type SearchResponse = Readonly<{
  results: readonly SearchResult[];
  meta: Readonly<{
    scope: SearchScope;
    types: readonly SearchTypeFilter[];
    limit: number;
    cursor: string | null;
    nextCursor: string | null;
  }>;
}>;

/**
 * Type guard for scope values.
 *
 * @param value - Untrusted scope value.
 * @returns Whether value is a valid scope.
 */
export function isSearchScope(value: string): value is SearchScope {
  return (SEARCH_SCOPES as readonly string[]).includes(value);
}

/**
 * Type guard for search type filters.
 *
 * @param value - Untrusted type filter value.
 * @returns Whether value is a valid search type filter.
 */
export function isSearchTypeFilter(value: string): value is SearchTypeFilter {
  return (SEARCH_TYPE_FILTERS as readonly string[]).includes(value);
}
