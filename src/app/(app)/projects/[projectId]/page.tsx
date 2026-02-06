import { connection } from "next/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { listProjectFiles } from "@/lib/data/files.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { listRunsByProject } from "@/lib/data/runs.server";

/**
 * Project overview page.
 *
 * @param props - Route params.
 * @returns The project overview UI.
 */
export default async function ProjectOverviewPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  await connection();
  const { projectId } = await props.params;
  const user = await requireAppUser();

  const [project, files, runs] = await Promise.all([
    getProjectByIdForUser(projectId, user.id),
    listProjectFiles(projectId, { limit: 1 }),
    listRunsByProject(projectId, { limit: 1 }),
  ]);

  if (!project) {
    // Layout handles notFound; keep this as a defensive fallback.
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Uploads</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{files.length}</p>
          <p className="text-muted-foreground text-sm">
            Showing the most recent upload only.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{runs.length}</p>
          <p className="text-muted-foreground text-sm">
            Showing the most recent run only.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Chat</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Use Chat to ask questions grounded in your uploads.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
