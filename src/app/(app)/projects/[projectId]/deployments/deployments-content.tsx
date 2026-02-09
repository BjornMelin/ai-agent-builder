import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { listDeploymentsByProject } from "@/lib/data/deployments.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

/**
 * Deployments tab content (suspends for request-time data).
 *
 * @param props - Content props.
 * @returns Deployment list UI.
 */
export async function DeploymentsContent(
  props: Readonly<{ projectId: string }>,
) {
  const user = await requireAppUser();
  const project = await getProjectByIdForUser(props.projectId, user.id);
  if (!project) notFound();

  const deployments = await listDeploymentsByProject(project.id);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Deployments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {deployments.length === 0 ? (
            <Empty className="min-h-[160px] rounded-xl border">
              <EmptyHeader>
                <EmptyTitle>No deployments yet</EmptyTitle>
                <EmptyDescription>
                  Deployments created by implementation runs will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="grid gap-2">
              {deployments.map((deployment) => (
                <li key={deployment.id}>
                  <div className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate font-medium">
                        {deployment.status}
                      </p>
                      <p className="shrink-0 text-muted-foreground text-sm">
                        {formatDate(deployment.createdAt)}
                      </p>
                    </div>

                    <p className="text-muted-foreground text-sm">
                      Vercel deployment:{" "}
                      <span className="font-medium">
                        {deployment.vercelDeploymentId ?? "—"}
                      </span>
                    </p>

                    {deployment.deploymentUrl ? (
                      <div className="flex flex-wrap gap-3 text-sm">
                        <Link
                          className="rounded-xs underline-offset-4 hover:underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          href={deployment.deploymentUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open deployment
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
