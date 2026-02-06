import Link from "next/link";

import { RunControlsClient } from "@/app/(app)/projects/[projectId]/runs/run-controls-client";
import { RunDateClient } from "@/app/(app)/projects/[projectId]/runs/run-date-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { listRunsByProject } from "@/lib/data/runs.server";

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
      <CardContent className="space-y-6">
        <RunControlsClient projectId={projectId} />

        {runs.length === 0 ? (
          <Empty className="min-h-[180px] rounded-xl border">
            <EmptyHeader>
              <EmptyTitle>No runs yet</EmptyTitle>
              <EmptyDescription>
                Start a research or implementation run to stream workflow
                output.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul
            className="grid gap-2"
            style={{
              containIntrinsicSize: "auto 220px",
              contentVisibility: "auto",
            }}
          >
            {runs.map((run) => (
              <li key={run.id}>
                <Link
                  className="group flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/60"
                  href={`/projects/${projectId}/runs/${run.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{run.kind}</p>
                    <p className="truncate text-muted-foreground text-sm">
                      {run.status} · <RunDateClient createdAt={run.createdAt} />
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
