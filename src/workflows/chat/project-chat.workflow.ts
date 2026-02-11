import { DurableAgent } from "@workflow/ai/agent";
import {
  convertToModelMessages,
  type FileUIPart,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";

import { getEnabledAgentMode } from "@/lib/ai/agents/registry.server";
import { buildSkillsPrompt } from "@/lib/ai/skills/prompt";
import { buildChatToolsForMode } from "@/lib/ai/tools/factory.server";
import { getWorkflowChatModel } from "@/workflows/ai/gateway-models.step";
import { chatMessageHook } from "@/workflows/chat/hooks/chat-message";
import { persistChatMessagesForWorkflowRun } from "@/workflows/chat/steps/chat-messages.step";
import { touchChatThreadState } from "@/workflows/chat/steps/chat-thread-state.step";
import { listProjectSkillsStep } from "@/workflows/chat/steps/skills.step";
import {
  writeStreamClose,
  writeUserMessageMarker,
} from "@/workflows/chat/steps/writer.step";
import { createChatToolContext } from "@/workflows/chat/tool-context";
import { isWorkflowRunCancelledError } from "@/workflows/runs/workflow-errors";

function formatAttachedFilesNote(files: readonly FileUIPart[]): string {
  const counts = new Map<string, number>();
  const ordered: string[] = [];

  for (const file of files) {
    const label = file.filename?.trim() || "Attachment";
    if (!counts.has(label)) {
      ordered.push(label);
      counts.set(label, 1);
    } else {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const unique = ordered.filter((label) => label.length > 0);
  if (unique.length === 0) {
    return "Attached files provided.";
  }
  const preview = unique
    .slice(0, 5)
    .map((label) => {
      const count = counts.get(label) ?? 1;
      return count > 1 ? `${label} (x${count})` : label;
    })
    .join(", ");
  const suffix = unique.length > 5 ? ` (+${unique.length - 5} more)` : "";
  return `Attached files: ${preview}${suffix}.`;
}

function normalizeUiUserMessageForModel(message: UIMessage): UIMessage {
  if (message.role !== "user") return message;

  const fileParts = message.parts.filter(
    (part): part is FileUIPart => part.type === "file",
  );
  if (fileParts.length === 0) return message;

  const nonFileParts = message.parts.filter((part) => part.type !== "file");
  const note = formatAttachedFilesNote(fileParts);
  const prefix = nonFileParts.some((p) => p.type === "text") ? "\n\n" : "";

  return {
    ...message,
    // Do not pass file parts to the model directly; we rely on ingestion + retrieval
    // for documents, and include filenames as a text hint for grounding.
    parts: [...nonFileParts, { text: `${prefix}[${note}]`, type: "text" }],
  };
}

/**
 * Durable multi-turn chat workflow for a single project.
 *
 * @remarks
 * See SPEC-0027 for skills prompt integration details and SPEC-0028 for skills
 * registry integration behavior.
 *
 * @param projectId - Project scope for retrieval and persistence.
 * @param initialMessages - Initial UI messages (must end with a user message).
 * @param threadTitle - Thread title used when lifecycle persistence needs to create the row.
 * @param modeId - Agent mode identifier (system prompt + tool allowlist).
 * @returns Final conversation messages.
 * @throws Error - Propagates workflow execution or finalization failures.
 */
export async function projectChat(
  projectId: string,
  initialMessages: UIMessage[],
  threadTitle: string,
  modeId: string,
): Promise<Readonly<{ messages: ModelMessage[] }>> {
  "use workflow";

  const { workflowRunId: runId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();
  let finishedStatus: "succeeded" | "failed" | "canceled" | null = null;
  let thrownError: unknown = null;
  const messages: ModelMessage[] = [];
  const mode = getEnabledAgentMode(modeId);
  const tools = buildChatToolsForMode(modeId);
  let skills: Awaited<ReturnType<typeof listProjectSkillsStep>> = [];
  const threadStateInput = {
    mode: mode.modeId,
    projectId,
    title: threadTitle,
    workflowRunId: runId,
  } as const;

  try {
    skills = await listProjectSkillsStep({ projectId });
    messages.push(
      ...(await convertToModelMessages(
        initialMessages.map(normalizeUiUserMessageForModel),
        {
          tools,
        },
      )),
    );

    await touchChatThreadState({ ...threadStateInput, status: "running" });

    // Write markers for initial user messages so replay can reconstruct order.
    for (const msg of initialMessages) {
      if (msg.role !== "user") continue;
      const text = msg.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("");
      const files = msg.parts.filter(
        (part): part is FileUIPart => part.type === "file",
      );
      if (!text && files.length === 0) continue;

      await writeUserMessageMarker(writable, {
        content: text,
        ...(files.length > 0 ? { files } : {}),
        messageId: msg.id,
      });
    }

    const agent = new DurableAgent({
      model: () => getWorkflowChatModel(mode.defaultModel),
      system: [mode.systemPrompt, buildSkillsPrompt(skills)].join("\n\n"),
      tools,
    });

    const hook = chatMessageHook.create({ token: runId });
    let turnNumber = 0;

    while (true) {
      turnNumber += 1;

      await touchChatThreadState({ ...threadStateInput, status: "running" });

      const result = await agent.stream({
        activeTools: [...mode.allowedTools],
        collectUIMessages: true,
        experimental_context: createChatToolContext(projectId, modeId, skills),
        maxSteps: mode.budgets.maxStepsPerTurn,
        messages,
        preventClose: true,
        sendFinish: false,
        sendStart: turnNumber === 1,
        writable,
      });
      messages.push(...result.messages.slice(messages.length));
      if (result.uiMessages) {
        await persistChatMessagesForWorkflowRun({
          messages: result.uiMessages,
          workflowRunId: runId,
        });
      }

      await touchChatThreadState({ ...threadStateInput, status: "waiting" });

      const { files: rawFiles, message: followUp, messageId } = await hook;
      if (followUp === "/done") break;

      const files: FileUIPart[] | undefined =
        rawFiles && rawFiles.length > 0
          ? rawFiles.map(({ filename, ...rest }) =>
              filename === undefined ? rest : { ...rest, filename },
            )
          : undefined;

      await writeUserMessageMarker(writable, {
        content: followUp ?? "",
        ...(files && files.length > 0 ? { files } : {}),
        messageId,
      });
      const nextText = [
        followUp?.trim().length ? followUp.trim() : null,
        files && files.length > 0
          ? `[${formatAttachedFilesNote(files)}]`
          : null,
      ]
        .filter((part): part is string => typeof part === "string")
        .join("\n\n");

      if (nextText.length > 0) {
        messages.push({ content: nextText, role: "user" });
      }
    }

    finishedStatus = "succeeded";
  } catch (error) {
    finishedStatus = isWorkflowRunCancelledError(error) ? "canceled" : "failed";
    thrownError = error;
  } finally {
    const finalizationTasks: Promise<unknown>[] = [writeStreamClose(writable)];
    if (finishedStatus) {
      finalizationTasks.push(
        touchChatThreadState({
          ...threadStateInput,
          endedAt: new Date(),
          status: finishedStatus,
        }),
      );
    }

    const finalizationResults = await Promise.allSettled(finalizationTasks);
    const finalizationError = finalizationResults.find(
      (result) => result.status === "rejected",
    );
    if (!thrownError && finalizationError?.status === "rejected") {
      thrownError = finalizationError.reason;
    }
  }

  if (thrownError !== null && thrownError !== undefined) {
    throw thrownError;
  }

  return { messages };
}
