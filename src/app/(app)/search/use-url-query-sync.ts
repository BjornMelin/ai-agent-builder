import { useCallback, useRef } from "react";

/** Options controlling whether the URL should be updated during sync. */
export type UrlQuerySyncOptions = Readonly<{ syncUrl: boolean }>;

/** Result of consuming a URL query change, indicating execution and input sync needs. */
export type UrlQuerySyncChange = Readonly<{
  shouldExecute: boolean;
  syncInput: boolean;
}>;

type UrlQuerySyncParams = Readonly<{
  urlQuery: string;
  syncQueryInUrl: (query: string) => void;
}>;

/**
 * Encapsulates the URL query sync loop-avoidance logic between local search state
 * and `?q=` in the URL.
 *
 * @param params - Current URL query and a callback to update `?q=` without
 *   scrolling.
 * @returns Helpers for "maybe sync URL" (on submit) and "consume URL changes"
 *   (on `useEffect` reacting to `urlQuery`).
 */
export function useUrlQuerySync(params: UrlQuerySyncParams) {
  const { syncQueryInUrl, urlQuery } = params;
  const hasCompletedInitialSyncRef = useRef(false);
  const skipNextUrlQueryRef = useRef<string | null>(null);

  const normalizeQuery = useCallback((query: string) => query.trim(), []);

  const maybeSkipAndSync = useCallback(
    (query: string, options: UrlQuerySyncOptions) => {
      if (!options.syncUrl) return;

      const normalizedQuery = normalizeQuery(query);
      const normalizedUrlQuery = normalizeQuery(urlQuery);

      if (normalizedQuery !== normalizedUrlQuery) {
        skipNextUrlQueryRef.current = normalizedQuery;
      } else {
        skipNextUrlQueryRef.current = null;
      }

      syncQueryInUrl(normalizedQuery);
    },
    [normalizeQuery, syncQueryInUrl, urlQuery],
  );

  const consumeUrlQueryChange = useCallback(
    (nextUrlQuery: string): UrlQuerySyncChange => {
      const normalizedUrlQuery = normalizeQuery(nextUrlQuery);

      if (skipNextUrlQueryRef.current === normalizedUrlQuery) {
        skipNextUrlQueryRef.current = null;
        hasCompletedInitialSyncRef.current = true;
        return { shouldExecute: false, syncInput: false };
      }

      const syncInput = hasCompletedInitialSyncRef.current;
      hasCompletedInitialSyncRef.current = true;
      return { shouldExecute: true, syncInput };
    },
    [normalizeQuery],
  );

  return { consumeUrlQueryChange, maybeSkipAndSync };
}
