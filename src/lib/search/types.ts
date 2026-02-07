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
 * Shared search UI status.
 */
export type SearchStatus = "idle" | "loading" | "error";

/**
 * Search scope value.
 */
export type SearchScope = (typeof SEARCH_SCOPES)[number];

/**
 * Search domain filter value.
 */
export type SearchTypeFilter = (typeof SEARCH_TYPE_FILTERS)[number];

/**
 * A project matched by a global search query, containing only the fields needed
 * for result rendering.
 */
export type ProjectSearchResult = Readonly<{
  type: "project";
  id: string;
  title: string;
  href: string;
}>;

/**
 * An upload match that includes a short snippet plus provenance metadata used to
 * link back to the owning project.
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
 * A matched document chunk with an optional score and enough provenance to
 * navigate to the parent upload and page range.
 */
export type ChunkSearchResult = Readonly<{
  type: "chunk";
  id: string;
  score?: number;
  title: string;
  snippet: string;
  href: string;
  provenance: Readonly<{
    projectId: string;
    fileId: string;
    chunkIndex: number;
    pageStart?: number;
    pageEnd?: number;
  }>;
}>;

/**
 * A matched artifact, including its kind, logical key, and version for precise
 * identification and linking within a project.
 */
export type ArtifactSearchResult = Readonly<{
  type: "artifact";
  id: string;
  score?: number;
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
 * A matched workflow run returned by the search API, including its id, title,
 * snippet, and href, plus provenance details (projectId, kind:
 * "research"|"implementation", and status values: "pending", "running",
 * "waiting", "blocked", "succeeded", "failed", "canceled").
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
