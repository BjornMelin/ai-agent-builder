import { Suspense } from "react";

import { ProjectSearchClient } from "@/app/(app)/projects/[projectId]/search/search-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
          fallback={<div aria-hidden="true" className="min-h-[120px] w-full" />}
        >
          <ProjectSearchClient projectId={projectId} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
