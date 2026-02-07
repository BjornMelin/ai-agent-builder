import Link from "next/link";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { SearchResult, SearchStatus } from "@/lib/search/types";

const LOADING_ROW_IDS = [
  "loading-row-1",
  "loading-row-2",
  "loading-row-3",
  "loading-row-4",
  "loading-row-5",
  "loading-row-6",
] as const;

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

function LoadingRows() {
  return (
    <div className="grid gap-2">
      {LOADING_ROW_IDS.map((rowId) => (
        <div className="rounded-xl border p-3" key={rowId}>
          <Skeleton className="mb-2 h-4 w-1/3" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ))}
    </div>
  );
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

  if (props.status === "loading") {
    return <LoadingRows />;
  }

  if (props.results.length === 0) {
    if (props.query.trim().length === 0 || !props.hasSearched) {
      return (
        <p className="text-muted-foreground text-sm">{props.idleMessage}</p>
      );
    }

    return (
      <Empty className="min-h-[180px] rounded-xl border">
        <EmptyHeader>
          <EmptyTitle>No matches found</EmptyTitle>
          <EmptyDescription>{props.emptyMessage}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul
      className="grid gap-2"
      style={{
        containIntrinsicSize: "auto 220px",
        contentVisibility: "auto",
      }}
    >
      {props.results.map((result) => {
        const snippet = resultSnippet(result);
        return (
          <li
            className="rounded-xl border bg-card px-4 py-3"
            key={`${result.type}-${result.id}`}
          >
            <Link
              className="font-medium underline-offset-4 hover:underline"
              href={result.href}
            >
              {result.title}
            </Link>
            {snippet ? (
              <p className="mt-1 text-muted-foreground text-sm">{snippet}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
