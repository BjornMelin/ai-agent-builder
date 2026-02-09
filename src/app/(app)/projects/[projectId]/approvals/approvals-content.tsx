import { notFound } from "next/navigation";

import { ApprovalsClient } from "@/app/(app)/projects/[projectId]/approvals/approvals-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { listPendingApprovals } from "@/lib/data/approvals.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";

/**
 * Approvals tab content.
 *
 * @param props - Content props.
 * @returns Approvals UI.
 */
export async function ApprovalsContent(props: Readonly<{ projectId: string }>) {
  const user = await requireAppUser();
  const project = await getProjectByIdForUser(props.projectId, user.id);
  if (!project) notFound();

  const approvals = await listPendingApprovals(project.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approvals</CardTitle>
      </CardHeader>
      <CardContent>
        <ApprovalsClient initialApprovals={approvals} projectId={project.id} />
      </CardContent>
    </Card>
  );
}
