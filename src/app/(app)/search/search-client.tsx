"use client";

import { SearchBar } from "@/components/search/search-bar";
import { SearchResults } from "@/components/search/search-results";
import { useSearchClient } from "@/lib/search/use-search-client";

function buildGlobalSearchParams(_query: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set("scope", "global");
  params.set("types", "projects,uploads,chunks,artifacts,runs");
  params.set("limit", "20");
  return params;
}

/**
 * Provides a unified search interface across projects and indexed content.
 *
 * @returns Global search interface across projects and indexed content.
 */
export function GlobalSearchClient() {
  const searchInputId = "global-search";
  const searchStatusId = "global-search-status";
  const searchErrorId = "global-search-error";
  const { error, executeSearch, hasSearched, q, results, setQ, status } =
    useSearchClient({
      buildSearchParams: buildGlobalSearchParams,
      inputId: searchInputId,
    });

  const statusMessage =
    status === "loading"
      ? "Searching all projects…"
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
          // Fire-and-forget: executeSearch owns error state and will surface failures via setError.
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
