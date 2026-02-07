import { useCallback, useRef } from "react";

export type UrlQuerySyncOptions = Readonly<{ syncUrl: boolean }>;

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

  const maybeSkipAndSync = useCallback(
    (query: string, options: UrlQuerySyncOptions) => {
      if (!options.syncUrl) return;

      if (query !== urlQuery.trim()) {
        skipNextUrlQueryRef.current = query;
      } else {
        skipNextUrlQueryRef.current = null;
      }

      syncQueryInUrl(query);
    },
    [syncQueryInUrl, urlQuery],
  );

  const consumeUrlQueryChange = useCallback(
    (nextUrlQuery: string): UrlQuerySyncChange => {
      const normalizedUrlQuery = nextUrlQuery.trim();

      if (skipNextUrlQueryRef.current === normalizedUrlQuery) {
        skipNextUrlQueryRef.current = null;
        hasCompletedInitialSyncRef.current = true;
        return { shouldExecute: false, syncInput: false };
      }

      const syncInput = hasCompletedInitialSyncRef.current;
      hasCompletedInitialSyncRef.current = true;
      return { shouldExecute: true, syncInput };
    },
    [],
  );

  return { consumeUrlQueryChange, maybeSkipAndSync };
}
