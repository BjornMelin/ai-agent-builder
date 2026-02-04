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
        <CardTitle>Search</CardTitle>
      </CardHeader>
      <CardContent>
        <ProjectSearchClient projectId={projectId} />
      </CardContent>
    </Card>
  );
}
