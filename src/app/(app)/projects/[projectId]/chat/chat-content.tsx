import { notFound } from "next/navigation";

import { ProjectChatClient } from "@/app/(app)/projects/[projectId]/chat/chat-client";
import {
  DEFAULT_AGENT_MODE_ID,
  listEnabledAgentModes,
} from "@/lib/ai/agents/registry.server";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { budgets } from "@/lib/config/budgets.server";
import {
  getChatThreadById,
  getLatestChatThreadByProjectId,
  listChatMessagesByThreadId,
  listChatThreadsByProjectId,
} from "@/lib/data/chat.server";
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
    threadId?: string | undefined;
  }>,
) {
  const { projectId, threadId } = props;

  const user = await requireAppUser();
  const project = await getProjectByIdForUser(projectId, user.id);
  if (!project) {
    notFound();
  }

  const threadsPromise = listChatThreadsByProjectId(project.id, user.id);
  const activeThreadPromise = threadId
    ? getChatThreadById(threadId, user.id)
    : getLatestChatThreadByProjectId(project.id, user.id);
  const enabledModes = listEnabledAgentModes();

  const [threads, activeThread] = await Promise.all([
    threadsPromise,
    activeThreadPromise,
  ]);

  if (threadId && !activeThread) {
    notFound();
  }

  const isTerminal =
    activeThread?.status === "succeeded" ||
    activeThread?.status === "failed" ||
    activeThread?.status === "canceled";

  const initialMessages =
    activeThread && isTerminal
      ? await listChatMessagesByThreadId(activeThread.id, user.id).then(
          (rows) =>
            rows
              .map((m) => m.uiMessage)
              .filter((m): m is NonNullable<typeof m> => m !== null),
        )
      : [];

  return (
    <ProjectChatClient
      key={activeThread?.id ?? "new-thread"}
      defaultModeId={DEFAULT_AGENT_MODE_ID}
      enabledModes={enabledModes.map((m) => ({
        description: m.description,
        displayName: m.displayName,
        modeId: m.modeId,
      }))}
      initialMessages={initialMessages}
      initialThread={activeThread}
      maxAttachmentBytes={budgets.maxUploadBytes}
      projectId={project.id}
      threads={threads}
    />
  );
}
