"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useUrlQuerySync } from "@/app/(app)/search/use-url-query-sync";
import { SearchBar } from "@/components/search/search-bar";
import { SearchResults } from "@/components/search/search-results";
import { useHydrationSafeTextState } from "@/lib/react/use-hydration-safe-input-state";
import { parseSearchResponse } from "@/lib/search/parse-search-response";
import type {
  SearchResponse,
  SearchResult,
  SearchStatus,
} from "@/lib/search/types";

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return name === "AbortError";
}

/**
 * Search client (project-scoped).
 *
 * @param props - Component props where `projectId` is a required, non-empty
 *   route-segment identifier (for example a UUID or slug) used to scope search
 *   requests and results.
 * @returns The search UI for the project.
 */
export function ProjectSearchClient(props: Readonly<{ projectId: string }>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputId = `project-search-${props.projectId}`;
  const searchStatusId = `project-search-status-${props.projectId}`;
  const searchErrorId = `project-search-error-${props.projectId}`;
  const urlQuery = searchParams.get("q") ?? "";
  const [q, setQ] = useHydrationSafeTextState({
    element: "input",
    elementId: searchInputId,
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
    async (
      rawQuery: string,
      options: Readonly<{ syncInput: boolean; syncUrl: boolean }>,
    ) => {
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
        url.searchParams.set("projectId", props.projectId);
        url.searchParams.set("scope", "project");
        url.searchParams.set("limit", "20");

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
    [maybeSkipAndSync, props.projectId, setQ],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const { shouldExecute, syncInput } = consumeUrlQueryChange(urlQuery);
      if (!shouldExecute) return;
      void executeSearch(urlQuery, { syncInput, syncUrl: false });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [consumeUrlQueryChange, executeSearch, urlQuery]);

  const statusMessage =
    status === "loading"
      ? "Searching project content…"
      : hasSearched
        ? `${results.length} result${results.length === 1 ? "" : "s"} loaded.`
        : "";

  return (
    <div className="flex flex-col gap-4">
      <SearchBar
        error={error}
        errorId={searchErrorId}
        inputId={searchInputId}
        label="Search this project"
        onQueryChange={setQ}
        onSubmit={() => {
          void executeSearch(q, { syncInput: false, syncUrl: true });
        }}
        placeholder="Search this project…"
        query={q}
        status={status}
        statusId={searchStatusId}
        statusMessage={statusMessage}
      />

      <SearchResults
        emptyMessage="No results found."
        error={error}
        errorId={searchErrorId}
        hasSearched={hasSearched}
        idleMessage="Enter at least 2 characters to search."
        query={hasSearched ? q : ""}
        results={results}
        status={status}
      />
    </div>
  );
}
