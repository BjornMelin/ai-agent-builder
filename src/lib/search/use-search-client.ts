"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type Dispatch,
  type SetStateAction,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useUrlQuerySync } from "@/app/(app)/search/use-url-query-sync";
import { useHydrationSafeTextState } from "@/lib/react/use-hydration-safe-input-state";
import { parseSearchResponse } from "@/lib/search/parse-search-response";
import type {
  SearchResponse,
  SearchResult,
  SearchStatus,
} from "@/lib/search/types";

type ExecuteSearchOptions = Readonly<{ syncInput: boolean; syncUrl: boolean }>;

/**
 * Configuration for `useSearchClient`.
 */
export type UseSearchClientConfig = Readonly<{
  /**
   * DOM id for the search input element.
   */
  inputId: string;
  /**
   * Builds additional search params for `/api/search` given the sanitized query.
   * The hook always sets the `q` parameter.
   */
  buildSearchParams: (query: string) => URLSearchParams;
}>;

/**
 * Return value for `useSearchClient`.
 */
export type UseSearchClientResult = Readonly<{
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  status: SearchStatus;
  error: string | null;
  results: readonly SearchResult[];
  hasSearched: boolean;
  executeSearch: (
    rawQuery: string,
    options: ExecuteSearchOptions,
  ) => Promise<void>;
}>;

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return name === "AbortError";
}

/**
 * Shared client-side search state machine used by project and global search UIs.
 *
 * @param config - Hook configuration defining element IDs and request parameters.
 * @returns Search state and an execute function for manual searches.
 */
export function useSearchClient(
  config: UseSearchClientConfig,
): UseSearchClientResult {
  const { buildSearchParams, inputId } = config;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [q, setQ] = useHydrationSafeTextState({
    element: "input",
    elementId: inputId,
    fallback: urlQuery,
  });
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const activeSearchControllerRef = useRef<AbortController | null>(null);

  const syncQueryInUrl = useCallback(
    (query: string) => {
      const nextParams = new URLSearchParams(window.location.search);
      if (query.length > 0) {
        nextParams.set("q", query);
      } else {
        nextParams.delete("q");
      }
      const nextQueryString = nextParams.toString();
      router.replace(
        nextQueryString ? `${pathname}?${nextQueryString}` : pathname,
        { scroll: false },
      );
    },
    [pathname, router],
  );

  const { consumeUrlQueryChange, maybeSkipAndSync } = useUrlQuerySync({
    syncQueryInUrl,
    urlQuery,
  });

  useEffect(() => {
    return () => {
      activeSearchControllerRef.current?.abort();
      activeSearchControllerRef.current = null;
    };
  }, []);

  const executeSearch = useCallback(
    async (rawQuery: string, options: ExecuteSearchOptions) => {
      if (options.syncInput) {
        setQ(rawQuery);
      }
      const query = rawQuery.trim();

      // Cancel any in-flight search to prevent stale results overwriting newer ones.
      activeSearchControllerRef.current?.abort();
      activeSearchControllerRef.current = null;

      if (query.length < 2) {
        setResults([]);
        setStatus("idle");
        setError(null);
        setHasSearched(false);
        maybeSkipAndSync(query, options);
        return;
      }

      setHasSearched(true);
      setStatus("loading");
      setError(null);

      maybeSkipAndSync(query, options);

      const controller = new AbortController();
      activeSearchControllerRef.current = controller;

      try {
        const url = new URL("/api/search", window.location.origin);
        url.searchParams.set("q", query);
        const params = buildSearchParams(query);
        for (const [key, value] of params.entries()) {
          url.searchParams.set(key, value);
        }

        const res = await fetch(url.toString(), {
          method: "GET",
          signal: controller.signal,
        });
        if (activeSearchControllerRef.current !== controller) return;

        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          setError(payload?.error?.message ?? "Search failed.");
          setStatus("error");
          return;
        }

        const json: unknown = await res.json();
        let payload: SearchResponse;
        try {
          payload = parseSearchResponse(json);
        } catch (err) {
          void err;
          setError("Search failed due to an unexpected server response.");
          setResults([]);
          setStatus("error");
          return;
        }
        if (activeSearchControllerRef.current !== controller) return;

        startTransition(() => {
          setResults(payload.results);
          setStatus("idle");
        });
      } catch (err) {
        if (activeSearchControllerRef.current !== controller) return;

        if (isAbortError(err)) {
          return;
        }
        setError("Network error. Please try again.");
        setStatus("error");
      } finally {
        if (activeSearchControllerRef.current === controller) {
          activeSearchControllerRef.current = null;
        }
      }
    },
    [buildSearchParams, maybeSkipAndSync, setQ],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const { shouldExecute, syncInput } = consumeUrlQueryChange(urlQuery);
      if (!shouldExecute) return;
      // Fire-and-forget: executeSearch owns error state and will surface failures via setError.
      void executeSearch(urlQuery, { syncInput, syncUrl: false });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [consumeUrlQueryChange, executeSearch, urlQuery]);

  return { error, executeSearch, hasSearched, q, results, setQ, status };
}
