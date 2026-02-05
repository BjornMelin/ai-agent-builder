import { ProjectChatClient } from "@/app/(app)/projects/[projectId]/chat/chat-client";
import { getLatestChatThreadByProjectId } from "@/lib/data/chat.server";

/**
 * Chat tab.
 *
 * @param props - The component properties.
 * @remarks `props.params` resolves to an object containing the required `projectId`.
 * @returns The chat page.
 */
export default async function ChatPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;
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
