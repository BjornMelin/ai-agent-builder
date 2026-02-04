import { ProjectChatClient } from "@/app/(app)/projects/[projectId]/chat/chat-client";

/**
 * Chat tab.
 *
 * @param props - The component properties.
 * @param props.params - A promise resolving to an object containing a required `projectId` (a URL-safe, non-empty string identifier used to load conversation and context data).
 * @returns The chat page.
 */
export default async function ChatPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;
  return <ProjectChatClient projectId={projectId} />;
}
