import { ArtifactListClient } from "@/app/(app)/projects/[projectId]/artifacts/artifact-list-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMarkdownContent } from "@/lib/artifacts/content.server";
import { listLatestArtifacts } from "@/lib/data/artifacts.server";

/**
 * Artifacts tab: list latest versions by key.
 *
 * @param props - Route params.
 * @returns Artifacts page.
 */
export default async function ArtifactsPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;
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
          href={`/api/export/${encodeURIComponent(projectId)}`}
          download
        >
          Export ZIP
        </a>
      </CardHeader>
      <CardContent>
        {artifacts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No artifacts yet. Runs can generate versioned artifacts for export
            and search.
          </p>
        ) : (
          <ArtifactListClient artifacts={artifactItems} projectId={projectId} />
        )}
      </CardContent>
    </Card>
  );
}
