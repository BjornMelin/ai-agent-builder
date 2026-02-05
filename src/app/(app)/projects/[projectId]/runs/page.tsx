import Link from "next/link";

import { RunControlsClient } from "@/app/(app)/projects/[projectId]/runs/run-controls-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRunsByProject } from "@/lib/data/runs.server";

/**
 * Ensure this route always renders dynamically (new runs are created frequently).
 */
export const dynamic = "force-dynamic";

/**
 * Runs tab (P0 list view).
 *
 * @param props - Route params.
 * @returns The runs page.
 */
export default async function RunsPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;
  const runs = await listRunsByProject(projectId, { limit: 50 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runs</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <RunControlsClient projectId={projectId} />
        </div>

        {runs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No runs yet. Start one to see its progress and artifacts.
          </p>
        ) : (
          <ul
            className="grid gap-2"
            style={{
              containIntrinsicSize: "auto 200px",
              contentVisibility: "auto",
            }}
          >
            {runs.map((run) => (
              <li key={run.id}>
                <Link
                  className="group flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 transition-colors hover:bg-muted/50"
                  href={`/projects/${projectId}/runs/${run.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{run.kind}</p>
                    <p className="truncate text-muted-foreground text-sm">
                      {run.status} · {new Date(run.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-sm transition-colors group-hover:text-foreground">
                    Open
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
