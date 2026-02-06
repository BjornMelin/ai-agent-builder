"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { SearchBar } from "@/components/search/search-bar";
import { SearchResults } from "@/components/search/search-results";
import { useHydrationSafeTextState } from "@/lib/react/use-hydration-safe-input-state";
import type { SearchResponse, SearchResult } from "@/lib/search/types";

type SearchStatus = "idle" | "loading" | "error";

/**
 * Global search client.
 *
 * @returns Global search interface across projects and indexed content.
 */
export function GlobalSearchClient() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputId = "global-search";
  const searchStatusId = "global-search-status";
  const searchErrorId = "global-search-error";
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
  const hasCompletedInitialSyncRef = useRef(false);
  const skipNextUrlQueryRef = useRef<string | null>(null);

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

  const executeSearch = useCallback(
    async (
      rawQuery: string,
      options: Readonly<{ syncInput: boolean; syncUrl: boolean }>,
    ) => {
      if (options.syncInput) {
        setQ(rawQuery);
      }
      const query = rawQuery.trim();
      if (query.length < 2) {
        setResults([]);
        setStatus("idle");
        setError(null);
        setHasSearched(false);
        if (options.syncUrl) {
          if (query !== urlQuery.trim()) {
            skipNextUrlQueryRef.current = query;
          } else {
            skipNextUrlQueryRef.current = null;
          }
          syncQueryInUrl(query);
        }
        return;
      }

      setHasSearched(true);
      setStatus("loading");
      setError(null);

      if (options.syncUrl) {
        if (query !== urlQuery.trim()) {
          skipNextUrlQueryRef.current = query;
        } else {
          skipNextUrlQueryRef.current = null;
        }
        syncQueryInUrl(query);
      }

      try {
        const url = new URL("/api/search", window.location.origin);
        url.searchParams.set("q", query);
        url.searchParams.set("scope", "global");
        url.searchParams.set("types", "projects,uploads,chunks,artifacts,runs");
        url.searchParams.set("limit", "20");

        const res = await fetch(url.toString(), { method: "GET" });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          setError(payload?.error?.message ?? "Search failed.");
          setStatus("error");
          return;
        }

        const payload = (await res.json()) as SearchResponse;
        startTransition(() => {
          setResults(payload.results);
        });
        setStatus("idle");
      } catch {
        setError("Network error. Please try again.");
        setStatus("error");
      }
    },
    [setQ, syncQueryInUrl, urlQuery],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const normalizedUrlQuery = urlQuery.trim();
      if (skipNextUrlQueryRef.current === normalizedUrlQuery) {
        skipNextUrlQueryRef.current = null;
        hasCompletedInitialSyncRef.current = true;
        return;
      }
      const syncInput = hasCompletedInitialSyncRef.current;
      hasCompletedInitialSyncRef.current = true;
      void executeSearch(urlQuery, { syncInput, syncUrl: false });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [executeSearch, urlQuery]);

  const statusMessage =
    status === "loading"
      ? "Searching all projects."
      : hasSearched
        ? `${results.length} result${results.length === 1 ? "" : "s"} loaded.`
        : "";

  return (
    <div className="flex flex-col gap-4">
      <SearchBar
        error={error}
        errorId={searchErrorId}
        inputId={searchInputId}
        label="Search all projects"
        onQueryChange={setQ}
        onSubmit={() => {
          void executeSearch(q, { syncInput: false, syncUrl: true });
        }}
        placeholder="Search projects, uploads, chunks, artifacts, runs…"
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
        idleMessage="Enter at least 2 characters to search all projects."
        query={hasSearched ? q : ""}
        results={results}
        status={status}
      />
    </div>
  );
}
