import "server-only";

/**
 * Cost and safety budgets for external calls (AI Gateway, Upstash, research tools).
 *
 * Source of truth: docs/architecture/adr/ADR-0013-caching-cost-controls-next-js-caching-upstash-redis-budgets.md
 */
export type BudgetConfig = Readonly<{
  /**
   * Maximum number of results returned from vector search.
   */
  maxVectorTopK: number;

  /**
   * Maximum number of web search tool calls per agent turn.
   */
  maxWebSearchCallsPerTurn: number;

  /**
   * Maximum number of results returned from a single web search call.
   */
  maxWebSearchResults: number;

  /**
   * Maximum number of web extract tool calls per agent turn.
   */
  maxWebExtractCallsPerTurn: number;

  /**
   * Maximum number of characters persisted/returned per extracted URL.
   */
  maxWebExtractCharsPerUrl: number;

  /**
   * Maximum number of citations stored for a single artifact version.
   */
  maxCitationsPerArtifact: number;

  /**
   * Maximum number of Context7 tool calls per agent turn.
   */
  maxContext7CallsPerTurn: number;

  /**
   * Maximum response size (bytes) accepted from Context7 (defense-in-depth).
   */
  maxContext7ResponseBytes: number;

  /**
   * Maximum upload size accepted by the API (bytes).
   *
   * @remarks
   * This is enforced both on request metadata (defense-in-depth) and on the
   * actual downloaded bytes when registering uploaded blobs.
   */
  maxUploadBytes: number;

  /**
   * Maximum number of chunks embedded per batch call.
   */
  maxEmbedBatchSize: number;

  /**
   * Default TTL (seconds) for Redis-cached tool results.
   */
  toolCacheTtlSeconds: number;

  /**
   * TTL (seconds) for cached web search results.
   */
  webSearchCacheTtlSeconds: number;

  /**
   * TTL (seconds) for cached web extraction results.
   */
  webExtractCacheTtlSeconds: number;

  /**
   * TTL (seconds) for cached Context7 responses.
   */
  context7CacheTtlSeconds: number;

  /**
   * Timeout (milliseconds) for web search requests (Exa).
   */
  webSearchTimeoutMs: number;

  /**
   * Timeout (milliseconds) for web extraction requests (Firecrawl).
   */
  webExtractTimeoutMs: number;

  /**
   * Timeout (milliseconds) for Context7 MCP tool calls.
   */
  context7TimeoutMs: number;
}>;

/**
 * Default budget configuration.
 *
 * Kept intentionally conservative for a single-user deployment.
 */
export const budgets: BudgetConfig = {
  context7CacheTtlSeconds: 60 * 60 * 24,
  context7TimeoutMs: 15_000,
  maxCitationsPerArtifact: 25,
  maxContext7CallsPerTurn: 2,
  maxContext7ResponseBytes: 250_000,
  maxEmbedBatchSize: 64,
  maxUploadBytes: 25 * 1024 * 1024,
  maxVectorTopK: 12,
  maxWebExtractCallsPerTurn: 4,
  maxWebExtractCharsPerUrl: 20_000,
  maxWebSearchCallsPerTurn: 2,
  maxWebSearchResults: 8,
  toolCacheTtlSeconds: 60 * 10,
  webExtractCacheTtlSeconds: 60 * 60,
  webExtractTimeoutMs: 30_000,
  webSearchCacheTtlSeconds: 60 * 10,
  webSearchTimeoutMs: 20_000,
};
