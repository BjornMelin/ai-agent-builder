import { ArtifactListClient } from "@/app/(app)/projects/[projectId]/artifacts/artifact-list-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { getMarkdownContent } from "@/lib/artifacts/content.server";
import { listLatestArtifacts } from "@/lib/data/artifacts.server";

/**
 * Artifacts tab content (suspends for request-time data).
 *
 * @param props - Route params.
 * @returns Artifacts page content.
 */
export async function ArtifactsContent(
  props: Readonly<{
    projectId: string;
  }>,
) {
  const { projectId } = props;

  const artifacts = await listLatestArtifacts(projectId, { limit: 200 });
  const artifactItems = artifacts.map((a) => {
    const markdown = getMarkdownContent(a.content);
    const title =
      markdown?.title ?? `${a.kind} · ${a.logicalKey} · v${a.version}`;
    return {
      id: a.id,
      kind: a.kind,
      logicalKey: a.logicalKey,
      title,
      version: a.version,
    };
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle>Artifacts</CardTitle>
        <a
          className="text-sm underline-offset-4 hover:underline"
          download
          href={`/api/export/${encodeURIComponent(projectId)}`}
        >
          Export ZIP
        </a>
      </CardHeader>
      <CardContent>
        {artifacts.length === 0 ? (
          <Empty className="min-h-[180px] rounded-xl border">
            <EmptyHeader>
              <EmptyTitle>No artifacts generated yet</EmptyTitle>
              <EmptyDescription>
                Run workflows to generate versioned artifacts for export and
                search.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ArtifactListClient artifacts={artifactItems} projectId={projectId} />
        )}
      </CardContent>
    </Card>
  );
}
