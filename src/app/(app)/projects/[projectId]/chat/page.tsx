import { ProjectChatClient } from "@/app/(app)/projects/[projectId]/chat/chat-client";

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
  return <ProjectChatClient projectId={projectId} />;
}
