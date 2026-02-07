"use client";

import { useCallback } from "react";

import { SearchBar } from "@/components/search/search-bar";
import { SearchResults } from "@/components/search/search-results";
import { useSearchClient } from "@/lib/search/use-search-client";

/**
 * Search client (project-scoped).
 *
 * @param props - Component props where `projectId` is a required, non-empty
 *   route-segment identifier (for example a UUID or slug) used to scope search
 *   requests and results.
 * @returns The search UI for the project.
 */
export function ProjectSearchClient(props: Readonly<{ projectId: string }>) {
  const searchInputId = `project-search-${props.projectId}`;
  const searchStatusId = `project-search-status-${props.projectId}`;
  const searchErrorId = `project-search-error-${props.projectId}`;
  const buildSearchParams = useCallback(
    (_query: string) => {
      const params = new URLSearchParams();
      params.set("projectId", props.projectId);
      params.set("scope", "project");
      params.set("limit", "20");
      return params;
    },
    [props.projectId],
  );

  const { error, executeSearch, hasSearched, q, results, setQ, status } =
    useSearchClient({ buildSearchParams, inputId: searchInputId });

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
          // Fire-and-forget: executeSearch owns error state and will surface failures via setError.
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
