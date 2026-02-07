import Link from "next/link";
import { notFound } from "next/navigation";

import { RunCancelClient } from "@/app/(app)/projects/[projectId]/runs/[runId]/run-cancel-client";
import { RunStepsListClient } from "@/app/(app)/projects/[projectId]/runs/[runId]/run-steps-list-client";
import { RunStreamClient } from "@/app/(app)/projects/[projectId]/runs/[runId]/run-stream-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { getRunById, listRunSteps } from "@/lib/data/runs.server";

/**
 * Run detail content (suspends for request-time data).
 *
 * @param props - Route params.
 * @returns Run detail UI.
 */
export async function RunDetailContent(
  props: Readonly<{
    projectId: string;
    runId: string;
  }>,
) {
  const { projectId, runId } = props;

  const runPromise = getRunById(runId);
  const stepsPromise = listRunSteps(runId);
  // Prevent unhandled rejections if auth redirects before Promise.all settles.
  void runPromise.catch(() => {});
  void stepsPromise.catch(() => {});
  const user = await requireAppUser();

  const projectPromise = getProjectByIdForUser(projectId, user.id);
  const [project, run, steps] = await Promise.all([
    projectPromise,
    runPromise,
    stepsPromise,
  ]);

  if (!project || !run || run.projectId !== project.id) {
    notFound();
  }

  const canCancel =
    run.status !== "canceled" &&
    run.status !== "failed" &&
    run.status !== "succeeded";

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">Run</p>
          <h2 className="truncate font-semibold text-xl tracking-tight">
            {run.kind} · {run.status}
          </h2>
          <p className="truncate text-muted-foreground text-sm">{run.id}</p>
        </div>
        <Link
          className="text-sm underline-offset-4 hover:underline"
          href={`/projects/${encodeURIComponent(projectId)}/runs`}
        >
          Back to runs
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Controls</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1">
            <p className="font-medium text-sm">Workflow</p>
            <p className="text-muted-foreground text-sm">
              {run.workflowRunId ? (
                <span className="font-mono text-xs">{run.workflowRunId}</span>
              ) : (
                "Not started"
              )}
            </p>
          </div>
          <div className="justify-self-start md:justify-self-end">
            <RunCancelClient
              canCancel={canCancel}
              projectId={projectId}
              runId={run.id}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Steps</CardTitle>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No steps recorded yet.
            </p>
          ) : (
            <RunStepsListClient steps={steps} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stream</CardTitle>
        </CardHeader>
        <CardContent>
          <RunStreamClient runId={run.id} />
        </CardContent>
      </Card>
    </div>
  );
}
