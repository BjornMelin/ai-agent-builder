import Link from "next/link";
import { notFound } from "next/navigation";

import { RunControlsClient } from "@/app/(app)/projects/[projectId]/runs/run-controls-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { listRunsByProject } from "@/lib/data/runs.server";

function formatUtcMinute(isoString: string): string {
  // createdAt is serialized from Date.toISOString() in the DAL.
  // Use a stable, locale-free format to avoid client hydration work.
  if (isoString.length >= 16) {
    const raw = isoString.slice(0, 16); // YYYY-MM-DDTHH:mm
    return `${raw.replace("T", " ")} UTC`;
  }
  return isoString;
}

/**
 * Runs tab content (suspends for request-time data).
 *
 * @param props - Route params.
 * @returns Runs page content.
 */
export async function RunsContent(
  props: Readonly<{
    projectId: string;
  }>,
) {
  const { projectId } = props;
  const user = await requireAppUser();
  const project = await getProjectByIdForUser(projectId, user.id);
  if (!project) {
    notFound();
  }

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
                  prefetch={false}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{run.kind}</p>
                    <p className="truncate text-muted-foreground text-sm">
                      {run.status} ·{" "}
                      <time dateTime={run.createdAt}>
                        {formatUtcMinute(run.createdAt)}
                      </time>
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
