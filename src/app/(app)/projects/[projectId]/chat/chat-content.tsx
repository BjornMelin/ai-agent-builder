import { notFound } from "next/navigation";

import { ProjectChatClient } from "@/app/(app)/projects/[projectId]/chat/chat-client";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { getLatestChatThreadByProjectId } from "@/lib/data/chat.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";

/**
 * Chat tab content (suspends for request-time data).
 *
 * @param props - Component props containing the target `props.projectId`.
 * @returns Chat page content.
 */
export async function ChatContent(
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

  const latestThread = await getLatestChatThreadByProjectId(project.id);

  return (
    <ProjectChatClient
      initialThread={
        latestThread?.workflowRunId
          ? {
              status: latestThread.status,
              workflowRunId: latestThread.workflowRunId,
            }
          : null
      }
      projectId={project.id}
    />
  );
}
