import Link from "next/link";

import type { SearchResult } from "@/lib/search/types";

type SearchStatus = "idle" | "loading" | "error";

/**
 * Reusable search results list with shared empty/error states.
 */
export type SearchResultsProps = Readonly<{
  query: string;
  status: SearchStatus;
  hasSearched: boolean;
  error: string | null;
  errorId: string;
  results: readonly SearchResult[];
  idleMessage: string;
  emptyMessage: string;
}>;

function resultSnippet(result: SearchResult): string | null {
  if (
    result.type === "chunk" ||
    result.type === "artifact" ||
    result.type === "run"
  ) {
    return result.snippet || "(no snippet)";
  }

  if (result.type === "upload") {
    return result.snippet;
  }

  return null;
}

/**
 * Search results renderer.
 *
 * @param props - Results list and state props.
 * @returns Results list UI.
 */
export function SearchResults(props: SearchResultsProps) {
  if (props.error) {
    return (
      <p className="text-destructive text-sm" id={props.errorId} role="alert">
        {props.error}
      </p>
    );
  }

  if (props.results.length === 0) {
    if (props.query.trim().length === 0) {
      return (
        <p className="text-muted-foreground text-sm">{props.idleMessage}</p>
      );
    }

    if (props.status === "loading") {
      return <p className="text-muted-foreground text-sm">Searching…</p>;
    }

    if (props.hasSearched) {
      return (
        <p className="text-muted-foreground text-sm">{props.emptyMessage}</p>
      );
    }

    return null;
  }

  return (
    <ul
      className="grid gap-2"
      style={{
        containIntrinsicSize: "auto 200px",
        contentVisibility: "auto",
      }}
    >
      {props.results.map((result) => {
        const snippet = resultSnippet(result);
        return (
          <li
            className="flex flex-col gap-1 rounded-md border bg-card px-3 py-2"
            key={`${result.type}-${result.id}`}
          >
            <Link
              className="font-medium underline-offset-4 hover:underline"
              href={result.href}
            >
              {result.title}
            </Link>
            {snippet ? (
              <p className="text-muted-foreground text-sm">{snippet}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
