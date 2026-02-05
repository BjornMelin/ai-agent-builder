import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMarkdownContent } from "@/lib/artifacts/content.server";
import { listLatestArtifacts } from "@/lib/data/artifacts.server";

/**
 * Ensure this route always renders dynamically (artifacts are created frequently).
 */
export const dynamic = "force-dynamic";

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

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle>Artifacts</CardTitle>
        <Link
          className="text-sm underline-offset-4 hover:underline"
          href={`/api/export/${encodeURIComponent(projectId)}`}
        >
          Export ZIP
        </Link>
      </CardHeader>
      <CardContent>
        {artifacts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No artifacts yet. Runs can generate versioned artifacts for export
            and search.
          </p>
        ) : (
          <ul
            className="grid gap-2"
            style={{
              containIntrinsicSize: "auto 200px",
              contentVisibility: "auto",
            }}
          >
            {artifacts.map((a) => {
              const markdown = getMarkdownContent(a.content);
              const title =
                markdown?.title ??
                `${a.kind} · ${a.logicalKey} · v${a.version}`;

              return (
                <li
                  className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
                  key={a.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{title}</p>
                    <p className="truncate text-muted-foreground text-sm">
                      {a.kind} · {a.logicalKey} · v{a.version}
                    </p>
                  </div>
                  <Link
                    className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
                    href={`/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(
                      a.id,
                    )}`}
                  >
                    Open
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
