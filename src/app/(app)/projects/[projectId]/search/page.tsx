import { Suspense } from "react";

import { ProjectSearchClient } from "@/app/(app)/projects/[projectId]/search/search-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Search tab.
 *
 * @param props - Route params.
 * @returns The search page.
 */
export default async function SearchPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search This Project</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense
          fallback={
            <div aria-hidden="true" className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Skeleton className="h-10 w-full md:flex-1" />
                <Skeleton className="h-10 w-24" />
              </div>
              <div className="grid gap-2">
                {["r1", "r2", "r3", "r4", "r5", "r6"].map((key) => (
                  <div className="rounded-xl border p-3" key={key}>
                    <Skeleton className="mb-2 h-4 w-1/3" />
                    <Skeleton className="h-3 w-5/6" />
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <ProjectSearchClient projectId={projectId} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
