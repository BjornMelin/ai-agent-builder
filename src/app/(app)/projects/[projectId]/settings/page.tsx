import { notFound } from "next/navigation";

import { ProjectLifecycleSettings } from "@/app/(app)/projects/[projectId]/settings/project-lifecycle-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { budgets } from "@/lib/config/budgets.server";
import { listDeploymentsByProject } from "@/lib/data/deployments.server";
import { listInfraResourcesByProject } from "@/lib/data/infra-resources.server";
import {
  getOwnedProjectByIdForUser,
  getProjectByIdForUser,
} from "@/lib/data/projects.server";
import { env } from "@/lib/env";

type FeatureStatus =
  | Readonly<{ status: "configured" }>
  | Readonly<{ status: "missing"; message: string }>;

function safeFeature(getter: () => unknown): FeatureStatus {
  try {
    getter();
    return { status: "configured" };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Missing configuration.";
    return { message, status: "missing" };
  }
}

/**
 * Settings tab displaying budgets and integration status.
 *
 * @param props - Route parameters for the current project.
 * @returns The settings page.
 */
export default async function ProjectSettingsPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;
  const user = await requireAppUser();
  const project = await getProjectByIdForUser(projectId, user.id);
  if (!project) notFound();
  const canManage = Boolean(
    await getOwnedProjectByIdForUser(projectId, user.id),
  );
  const [deployments, infraResources] = canManage
    ? await Promise.all([
        listDeploymentsByProject(projectId),
        listInfraResourcesByProject(projectId),
      ])
    : [[], []];

  const aiGateway = safeFeature(() => env.aiGateway);
  const upstash = safeFeature(() => env.upstash);
  const blob = safeFeature(() => env.blob);
  const qstashPublish = safeFeature(() => env.qstashPublish);
  const qstashVerify = safeFeature(() => env.qstashVerify);

  const nf = new Intl.NumberFormat();
  return (
    <div className="flex flex-col gap-6">
      <ProjectLifecycleSettings
        canManage={canManage}
        deletionReady={
          canManage &&
          blob.status === "configured" &&
          upstash.status === "configured"
        }
        {...(!canManage
          ? {
              deletionUnavailableReason:
                "This legacy project is read-only until ownership is backfilled.",
            }
          : blob.status !== "configured" || upstash.status !== "configured"
            ? {
                deletionUnavailableReason:
                  "Configure Vercel Blob and Upstash Redis/Vector before permanent deletion.",
              }
            : {})}
        project={project}
        retainsManagedResources={
          deployments.length > 0 || infraResources.length > 0
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Budgets</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <dl className="grid gap-3">
              <div>
                <dt className="text-muted-foreground">Max vector topK</dt>
                <dd className="font-medium">
                  {nf.format(budgets.maxVectorTopK)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Max upload bytes</dt>
                <dd className="font-medium">
                  {nf.format(budgets.maxUploadBytes)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Max embed batch size</dt>
                <dd className="font-medium">
                  {nf.format(budgets.maxEmbedBatchSize)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tool cache TTL (s)</dt>
                <dd className="font-medium">
                  {nf.format(budgets.toolCacheTtlSeconds)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="grid gap-3">
              <li>
                <p className="font-medium">AI Gateway</p>
                <p className="text-muted-foreground">
                  {aiGateway.status === "configured"
                    ? "Configured"
                    : aiGateway.message}
                </p>
              </li>
              <li>
                <p className="font-medium">Upstash (Redis + Vector)</p>
                <p className="text-muted-foreground">
                  {upstash.status === "configured"
                    ? "Configured"
                    : upstash.message}
                </p>
              </li>
              <li>
                <p className="font-medium">Vercel Blob</p>
                <p className="text-muted-foreground">
                  {blob.status === "configured" ? "Configured" : blob.message}
                </p>
              </li>
              <li>
                <p className="font-medium">QStash publish</p>
                <p className="text-muted-foreground">
                  {qstashPublish.status === "configured"
                    ? "Configured"
                    : qstashPublish.message}
                </p>
              </li>
              <li>
                <p className="font-medium">QStash verify</p>
                <p className="text-muted-foreground">
                  {qstashVerify.status === "configured"
                    ? "Configured"
                    : qstashVerify.message}
                </p>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
