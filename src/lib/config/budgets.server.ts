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
   * Maximum upload size accepted by the API (bytes).
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
}>;

/**
 * Default budget configuration.
 *
 * Kept intentionally conservative for a single-user deployment.
 */
export const budgets: BudgetConfig = {
  maxEmbedBatchSize: 64,
  maxUploadBytes: 25 * 1024 * 1024,
  maxVectorTopK: 12,
  toolCacheTtlSeconds: 60 * 10,
};
