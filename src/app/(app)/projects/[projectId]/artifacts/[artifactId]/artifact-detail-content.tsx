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
import { requireAppUser } from "@/lib/auth/require-app-user";
import {
  getArtifactById,
  listArtifactVersions,
} from "@/lib/data/artifacts.server";
import { listCitationsByArtifactId } from "@/lib/data/citations.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";

const ARTIFACT_JSON_PREVIEW_MAX_DEPTH = 6;
const ARTIFACT_JSON_PREVIEW_MAX_ARRAY_ITEMS = 100;
const ARTIFACT_JSON_PREVIEW_MAX_STRING_LENGTH = 4_000;
const ARTIFACT_JSON_PREVIEW_MAX_CHARS = 20_000;

function toJsonPreviewValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (depth >= ARTIFACT_JSON_PREVIEW_MAX_DEPTH) {
    return "[MaxDepth]";
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (typeof value === "string") {
    if (value.length <= ARTIFACT_JSON_PREVIEW_MAX_STRING_LENGTH) return value;
    return `${value.slice(0, ARTIFACT_JSON_PREVIEW_MAX_STRING_LENGTH)}… [truncated]`;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, ARTIFACT_JSON_PREVIEW_MAX_ARRAY_ITEMS);
    const mapped = items.map((item) =>
      toJsonPreviewValue(item, depth + 1, seen),
    );
    return value.length > items.length
      ? [...mapped, `[+${value.length - items.length} more items]`]
      : mapped;
  }

  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = toJsonPreviewValue(record[key], depth + 1, seen);
  }
  return out;
}

function formatArtifactJsonFallback(value: unknown): string {
  const previewValue = toJsonPreviewValue(value, 0, new WeakSet());
  let json = JSON.stringify(previewValue, null, 2) ?? "null";
  if (json.length > ARTIFACT_JSON_PREVIEW_MAX_CHARS) {
    json = `${json.slice(0, ARTIFACT_JSON_PREVIEW_MAX_CHARS)}\n… [truncated]`;
  }
  return `\`\`\`json\n${json}\n\`\`\``;
}

/**
 * Artifact detail content (suspends for request-time data).
 *
 * @param props - Route params.
 * @returns Artifact detail UI.
 */
export async function ArtifactDetailContent(
  props: Readonly<{
    projectId: string;
    artifactId: string;
  }>,
) {
  const { projectId, artifactId } = props;

  const user = await requireAppUser();
  const [project, artifact] = await Promise.all([
    getProjectByIdForUser(projectId, user.id),
    getArtifactById(artifactId),
  ]);
  if (!project) {
    notFound();
  }
  if (!artifact || artifact.projectId !== project.id) {
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
              <a href={`/api/export/${encodeURIComponent(projectId)}`}>
                Export ZIP
              </a>
            </Button>
          </ArtifactActions>
        </ArtifactHeader>
        <ArtifactContent>
          {markdown ? (
            <MessageResponse>{markdown.markdown}</MessageResponse>
          ) : (
            <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/20 p-4">
              <MessageResponse>
                {formatArtifactJsonFallback(artifact.content)}
              </MessageResponse>
            </div>
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
                  key={v.id}
                  size="sm"
                  variant={isActive ? "secondary" : "outline"}
                >
                  {isActive ? (
                    <span
                      aria-current="page"
                      aria-disabled="true"
                      data-disabled="true"
                    >
                      v{v.version}
                    </span>
                  ) : (
                    <Link
                      href={`/projects/${encodeURIComponent(
                        projectId,
                      )}/artifacts/${encodeURIComponent(v.id)}`}
                    >
                      v{v.version}
                    </Link>
                  )}
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
          <ul
            className="grid gap-2"
            style={{
              containIntrinsicSize: "auto 200px",
              contentVisibility: "auto",
            }}
          >
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
