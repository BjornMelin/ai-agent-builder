import { notFound } from "next/navigation";

import { CodeModeClient } from "@/app/(app)/projects/[projectId]/code-mode/code-mode-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { getProjectByIdForUser } from "@/lib/data/projects.server";

/**
 * Code Mode tab content.
 *
 * @param props - Content props.
 * @returns Code Mode content.
 */
export async function CodeModeContent(props: Readonly<{ projectId: string }>) {
  const user = await requireAppUser();
  const project = await getProjectByIdForUser(props.projectId, user.id);
  if (!project) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Code Mode</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Ask the agent to inspect and verify your connected repository in an
          isolated Vercel Sandbox VM. Output is streamed, redacted, and the
          transcript is persisted for auditing.
        </p>
        <CodeModeClient projectId={project.id} />
      </CardContent>
    </Card>
  );
}
