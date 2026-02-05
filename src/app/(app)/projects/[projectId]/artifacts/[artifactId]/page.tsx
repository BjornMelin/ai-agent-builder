import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Artifact,
  ArtifactActions,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getMarkdownContent } from "@/lib/artifacts/content.server";
import {
  getArtifactById,
  listArtifactVersions,
} from "@/lib/data/artifacts.server";
import { listCitationsByArtifactId } from "@/lib/data/citations.server";

/**
 * Ensure this route always renders dynamically (artifact versions can be created frequently).
 */
export const dynamic = "force-dynamic";

/**
 * Artifact detail page: render markdown + citations and link to other versions.
 *
 * @param props - Route params.
 * @returns Artifact detail page.
 */
export default async function ArtifactDetailPage(
  props: Readonly<{
    params: Promise<{ projectId: string; artifactId: string }>;
  }>,
) {
  const { projectId, artifactId } = await props.params;

  const artifact = await getArtifactById(artifactId);
  if (!artifact || artifact.projectId !== projectId) {
    notFound();
  }

  const [versions, citations] = await Promise.all([
    listArtifactVersions(projectId, {
      kind: artifact.kind,
      logicalKey: artifact.logicalKey,
    }),
    listCitationsByArtifactId(artifact.id),
  ]);

  const markdown = getMarkdownContent(artifact.content);
  const title = markdown?.title ?? `${artifact.kind} · ${artifact.logicalKey}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">Artifact</p>
          <h2 className="truncate font-semibold text-xl tracking-tight">
            {title} · v{artifact.version}
          </h2>
          <p className="truncate text-muted-foreground text-sm">
            {artifact.kind} · {artifact.logicalKey}
          </p>
        </div>
        <Link
          className="text-sm underline-offset-4 hover:underline"
          href={`/projects/${encodeURIComponent(projectId)}/artifacts`}
        >
          Back to artifacts
        </Link>
      </div>

      <Artifact>
        <ArtifactHeader>
          <div className="min-w-0">
            <ArtifactTitle>{title}</ArtifactTitle>
            <ArtifactDescription>
              {artifact.kind} · {artifact.logicalKey} · v{artifact.version}
            </ArtifactDescription>
          </div>
          <ArtifactActions>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/api/export/${encodeURIComponent(projectId)}`}>
                Export ZIP
              </Link>
            </Button>
          </ArtifactActions>
        </ArtifactHeader>
        <ArtifactContent>
          {markdown ? (
            <MessageResponse>{markdown.markdown}</MessageResponse>
          ) : (
            <MessageResponse>
              {`\`\`\`json\n${JSON.stringify(artifact.content, null, 2)}\n\`\`\``}
            </MessageResponse>
          )}
        </ArtifactContent>
      </Artifact>

      <div className="grid gap-3">
        <h3 className="font-medium">Versions</h3>
        {versions.length <= 1 ? (
          <p className="text-muted-foreground text-sm">
            No older versions available.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {versions.map((v) => {
              const isActive = v.id === artifact.id;
              return (
                <Button
                  asChild
                  disabled={isActive}
                  key={v.id}
                  size="sm"
                  variant={isActive ? "secondary" : "outline"}
                >
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    href={`/projects/${encodeURIComponent(
                      projectId,
                    )}/artifacts/${encodeURIComponent(v.id)}`}
                  >
                    v{v.version}
                  </Link>
                </Button>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      <div className="grid gap-3">
        <h3 className="font-medium">Citations</h3>
        {citations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No citations recorded for this version.
          </p>
        ) : (
          <ul className="grid gap-2">
            {citations.map((c) => (
              <li className="rounded-md border bg-card px-3 py-2" key={c.id}>
                <p className="font-medium text-sm">{c.sourceType}</p>
                <p className="break-all text-muted-foreground text-sm">
                  {c.sourceRef}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
