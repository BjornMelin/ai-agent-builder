import Link from "next/link";
import { notFound } from "next/navigation";

import { RunCancelClient } from "@/app/(app)/projects/[projectId]/runs/[runId]/run-cancel-client";
import { RunStreamClient } from "@/app/(app)/projects/[projectId]/runs/[runId]/run-stream-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProjectById } from "@/lib/data/projects.server";
import { getRunById, listRunSteps } from "@/lib/data/runs.server";

/**
 * Ensure this route always renders dynamically (run status changes frequently).
 */
export const dynamic = "force-dynamic";

/**
 * Run detail page (stream + persisted step timeline).
 *
 * @param props - Route params.
 * @returns Run detail page.
 */
export default async function RunDetailPage(
  props: Readonly<{ params: Promise<{ projectId: string; runId: string }> }>,
) {
  const { projectId, runId } = await props.params;

  const [project, run, steps] = await Promise.all([
    getProjectById(projectId),
    getRunById(runId),
    listRunSteps(runId),
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
          href={`/projects/${projectId}/runs`}
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
            <ul
              className="grid gap-2"
              style={{
                containIntrinsicSize: "auto 200px",
                contentVisibility: "auto",
              }}
            >
              {steps.map((step) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
                  key={step.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{step.stepName}</p>
                    <p className="truncate text-muted-foreground text-sm">
                      {step.status} · {step.stepKind} ·{" "}
                      <span className="font-mono text-xs">{step.stepId}</span>
                    </p>
                  </div>
                  <span className="text-muted-foreground text-sm">Step</span>
                </li>
              ))}
            </ul>
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
