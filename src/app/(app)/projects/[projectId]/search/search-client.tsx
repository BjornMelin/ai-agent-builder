"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SearchResult =
  | Readonly<{
      type: "project";
      id: string;
      title: string;
      href: string;
    }>
  | Readonly<{
      type: "chunk";
      id: string;
      score: number;
      title: string;
      snippet: string;
      href: string;
    }>;

type SearchResponse = Readonly<{ results: readonly SearchResult[] }>;

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
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const searchInputId = `project-search-${props.projectId}`;
  const searchStatusId = `project-search-status-${props.projectId}`;
  const searchErrorId = `project-search-error-${props.projectId}`;

  const syncQueryInUrl = (query: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (query.length > 0) {
      nextParams.set("q", query);
    } else {
      nextParams.delete("q");
    }
    const nextQueryString = nextParams.toString();
    router.replace(
      nextQueryString ? `${pathname}?${nextQueryString}` : pathname,
      {
        scroll: false,
      },
    );
  };

  async function runSearch() {
    const query = q.trim();
    if (query.length === 0) return;

    setHasSearched(true);
    setStatus("loading");
    setError(null);
    syncQueryInUrl(query);

    try {
      const url = new URL("/api/search", window.location.origin);
      url.searchParams.set("q", query);
      url.searchParams.set("projectId", props.projectId);

      const res = await fetch(url.toString(), { method: "GET" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error?.message ?? "Search failed.");
        setStatus("error");
        return;
      }

      const payload = (await res.json()) as SearchResponse;
      setResults(payload.results);
      setStatus("idle");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3 md:flex-row md:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <label className="sr-only" htmlFor={searchInputId}>
          Search this project
        </label>
        <Input
          aria-describedby={
            error ? `${searchStatusId} ${searchErrorId}` : searchStatusId
          }
          aria-invalid={status === "error"}
          id={searchInputId}
          onChange={(e) => setQ(e.currentTarget.value)}
          placeholder="Search this project…"
          value={q}
        />
        <Button
          aria-busy={status === "loading"}
          disabled={status === "loading"}
          type="submit"
        >
          {status === "loading" ? (
            <span
              aria-hidden="true"
              className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          ) : null}
          <span>Search</span>
        </Button>
      </form>

      <output aria-live="polite" className="sr-only" id={searchStatusId}>
        {status === "loading"
          ? "Searching project content."
          : q.trim().length > 0
            ? `${results.length} result${results.length === 1 ? "" : "s"} loaded.`
            : ""}
      </output>

      {error ? (
        <p className="text-destructive text-sm" id={searchErrorId} role="alert">
          {error}
        </p>
      ) : null}

      {results.length === 0 ? (
        q.trim().length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Enter a query to search.
          </p>
        ) : status === "loading" ? (
          <p className="text-muted-foreground text-sm">Searching…</p>
        ) : hasSearched ? (
          <p className="text-muted-foreground text-sm">No results found.</p>
        ) : null
      ) : (
        <ul
          className="grid gap-2"
          style={{
            containIntrinsicSize: "auto 200px",
            contentVisibility: "auto",
          }}
        >
          {results.map((r) => (
            <li
              className="flex flex-col gap-1 rounded-md border bg-card px-3 py-2"
              key={`${r.type}-${r.id}`}
            >
              <Link
                className="font-medium underline-offset-4 hover:underline"
                href={r.href}
              >
                {r.title}
              </Link>
              {r.type === "chunk" ? (
                <p className="text-muted-foreground text-sm">
                  {r.snippet || "(no snippet)"}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
