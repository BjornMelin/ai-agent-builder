import { Suspense } from "react";

import { GlobalSearchClient } from "@/app/(app)/search/search-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Global search page.
 *
 * @returns The global search UI.
 */
export default function GlobalSearchPage() {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Search</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense
          fallback={<div aria-hidden="true" className="min-h-[120px] w-full" />}
        >
          <GlobalSearchClient />
        </Suspense>
      </CardContent>
    </Card>
  );
}
