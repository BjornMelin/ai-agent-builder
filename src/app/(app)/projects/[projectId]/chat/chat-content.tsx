import { ProjectChatClient } from "@/app/(app)/projects/[projectId]/chat/chat-client";
import { getLatestChatThreadByProjectId } from "@/lib/data/chat.server";

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
  const latestThread = await getLatestChatThreadByProjectId(projectId);

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
      projectId={projectId}
    />
  );
}
