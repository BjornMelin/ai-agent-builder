import { Suspense } from "react";

import { GlobalSearchClient } from "@/app/(app)/search/search-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SEARCH_SKELETON_ROW_IDS = [
  "search-skeleton-row-1",
  "search-skeleton-row-2",
  "search-skeleton-row-3",
  "search-skeleton-row-4",
  "search-skeleton-row-5",
  "search-skeleton-row-6",
] as const;

function SearchSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Skeleton className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 rounded-full" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        <Skeleton className="h-10 w-full rounded-md md:w-24" />
      </div>

      <div className="grid gap-2">
        {SEARCH_SKELETON_ROW_IDS.map((rowId) => (
          <div className="rounded-xl border p-3" key={rowId}>
            <Skeleton className="mb-2 h-4 w-1/3" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Global search page.
 *
 * @returns The global search UI.
 */
export default function GlobalSearchPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Across Projects</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<SearchSkeleton />}>
          <GlobalSearchClient />
        </Suspense>
      </CardContent>
    </Card>
  );
}
