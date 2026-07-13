import { WorkflowAgent } from "@ai-sdk/workflow";
import {
  convertToModelMessages,
  type FileUIPart,
  isStepCount,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";

import { getEnabledAgentMode } from "@/lib/ai/agents/registry.server";
import { getChatModelById } from "@/lib/ai/gateway.server";
import { buildSkillsPrompt } from "@/lib/ai/skills/prompt";
import {
  buildChatToolsContext,
  buildChatToolsForMode,
} from "@/lib/ai/tools/factory.server";
import { isCanonicalInitialUserMessage } from "@/lib/chat/persisted-message";
import { chatMessageHook } from "@/workflows/chat/hooks/chat-message";
import {
  buildAssistantTurnMessageStep,
  collectBufferedToolResults,
  publishAssistantTurnStep,
} from "@/workflows/chat/steps/assistant-turn-stream.step";
import { acceptChatFollowUpStep } from "@/workflows/chat/steps/chat-follow-up.step";
import { persistChatMessagesForWorkflowRun } from "@/workflows/chat/steps/chat-messages.step";
import {
  registerChatWorkflowStep,
  transitionChatThreadStateStep,
} from "@/workflows/chat/steps/chat-thread-state.step";
import { listProjectSkillsStep } from "@/workflows/chat/steps/skills.step";
import {
  writeChatFollowUpDisposition,
  writeChatSessionStatus,
  writeChatTerminalAndClose,
  writeStreamClose,
  writeUserMessageMarker,
} from "@/workflows/chat/steps/writer.step";
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

function normalizeInitialUserMessageForModel(message: UIMessage): UIMessage {
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
 * @param initialMessage - The single initial user UI message.
 * @param modeId - Agent mode identifier (system prompt + tool allowlist).
 * @param threadId - Route-generated stable thread identity returned to the client.
 * @returns Final conversation messages.
 * @throws Error - Propagates workflow execution or finalization failures.
 */
export async function projectChat(
  projectId: string,
  initialMessage: UIMessage,
  modeId: string,
  threadId: string,
): Promise<Readonly<{ messages: ModelMessage[] }>> {
  "use workflow";

  if (!isCanonicalInitialUserMessage(initialMessage)) {
    throw new Error(
      "Project chat requires one meaningful text/file user message.",
    );
  }

  const { workflowRunId: runId } = getWorkflowMetadata();
  const ownsThread = await registerChatWorkflowStep(threadId, runId);
  if (!ownsThread) return { messages: [] };

  const writable = getWritable<UIMessageChunk>();
  let finishedStatus: "succeeded" | "failed" | "canceled" | null = null;
  let thrownError: unknown = null;
  const messages: ModelMessage[] = [];
  const mode = getEnabledAgentMode(modeId);
  let skills: Awaited<ReturnType<typeof listProjectSkillsStep>> = [];
  try {
    await persistChatMessagesForWorkflowRun({
      messages: [initialMessage],
      workflowRunId: runId,
    });

    skills = await listProjectSkillsStep({ projectId });
    const initialTools = buildChatToolsForMode(modeId);
    messages.push(
      ...(await convertToModelMessages(
        [normalizeInitialUserMessageForModel(initialMessage)],
        {
          tools: initialTools,
        },
      )),
    );

    const initialText = initialMessage.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    const initialFiles = initialMessage.parts.filter(
      (part): part is FileUIPart => part.type === "file",
    );
    if (initialText || initialFiles.length > 0) {
      await writeUserMessageMarker(writable, {
        content: initialText,
        ...(initialFiles.length > 0 ? { files: initialFiles } : {}),
        messageId: initialMessage.id,
      });
    }

    const hook = chatMessageHook.create({ token: runId });
    const hookConflict = await hook.getConflict();
    if (hookConflict) {
      throw new Error(
        `Chat hook token is already owned by run ${hookConflict.runId}.`,
      );
    }
    let turnNumber = 0;

    while (true) {
      turnNumber += 1;

      // A fresh toolset is the single budget owner for this outer turn.
      const tools = buildChatToolsForMode(modeId);
      const agent = new WorkflowAgent({
        instructions: [mode.systemPrompt, buildSkillsPrompt(skills)].join(
          "\n\n",
        ),
        model: getChatModelById(mode.defaultModel),
        tools,
      });
      const assistantMessageId = `assistant:${runId}:${turnNumber}`;
      const priorMessageCount = messages.length;
      const agentOutcome = await agent.stream({
        activeTools: [...mode.allowedTools],
        messages,
        stopWhen: isStepCount(mode.budgets.maxStepsPerTurn),
        toolsContext: buildChatToolsContext(
          mode.allowedTools,
          projectId,
          modeId,
        ),
      });
      // WorkflowAgent's returned prompt includes its constructor instructions
      // as a system message. Keep those instructions owned by the agent and
      // retain only conversation messages for the next outer user turn.
      const conversationMessages = agentOutcome.messages.filter(
        (message) => message.role !== "system",
      );
      const assistantMessage = await buildAssistantTurnMessageStep({
        assistantMessageId,
        steps: agentOutcome.steps.map((step) => ({
          reasoningText: step.reasoningText,
          text: step.text,
          toolCalls: step.toolCalls.map((call) => ({
            dynamic: "dynamic" in call ? call.dynamic : undefined,
            input: call.input,
            providerExecuted: call.providerExecuted,
            toolCallId: call.toolCallId,
            toolName: call.toolName,
          })),
        })),
        toolResults: collectBufferedToolResults(
          conversationMessages.slice(priorMessageCount),
        ),
      });

      await persistChatMessagesForWorkflowRun({
        messages: [assistantMessage],
        workflowRunId: runId,
      });
      await publishAssistantTurnStep({
        includeStart: turnNumber === 1,
        message: assistantMessage,
      });
      messages.splice(0, messages.length, ...conversationMessages);

      const waitingState = await transitionChatThreadStateStep({
        status: "waiting",
        workflowRunId: runId,
      });
      if (
        waitingState.status === "canceled" ||
        waitingState.status === "failed" ||
        waitingState.status === "succeeded"
      ) {
        throw new Error(`Chat thread became ${waitingState.status}.`);
      }
      await writeChatSessionStatus(writable, "waiting");

      let acceptedFollowUp: Readonly<{
        files: FileUIPart[] | undefined;
        followUp: string | undefined;
        kind: "command" | "user";
        messageId: string;
      }> | null = null;

      while (!acceptedFollowUp) {
        const {
          files: rawFiles,
          message: followUp,
          messageId,
          waitingSince,
        } = await hook;
        const files: FileUIPart[] | undefined =
          rawFiles && rawFiles.length > 0
            ? rawFiles.map(({ filename, ...rest }) =>
                filename === undefined ? rest : { ...rest, filename },
              )
            : undefined;
        const payload = {
          ...(files && files.length > 0 ? { files } : {}),
          ...(followUp ? { message: followUp } : {}),
        };
        const acceptance = await acceptChatFollowUpStep({
          messageId,
          payload,
          waitingSince,
          workflowRunId: runId,
        });

        if (acceptance.status === "terminal") {
          throw new Error("Chat thread became terminal.");
        }
        if (
          acceptance.status !== "accepted" &&
          acceptance.status !== "resume_committed"
        ) {
          await writeChatFollowUpDisposition(writable, {
            messageId,
            outcome:
              acceptance.status === "already_committed"
                ? "duplicate"
                : "rejected",
            reason: acceptance.status,
          });
          await writeChatSessionStatus(writable, "waiting");
          continue;
        }

        acceptedFollowUp = {
          files,
          followUp,
          kind: acceptance.kind,
          messageId,
        };
      }

      const { files, followUp, kind, messageId } = acceptedFollowUp;
      if (kind === "command") break;

      await writeChatSessionStatus(writable, "running");

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
    let finalizationError: unknown = null;
    let terminalState: Awaited<
      ReturnType<typeof transitionChatThreadStateStep>
    > | null = null;

    if (!finishedStatus) {
      finalizationError = new Error(
        "Chat workflow ended without a terminal status.",
      );
    } else {
      try {
        terminalState = await transitionChatThreadStateStep({
          endedAt: new Date(),
          status: finishedStatus,
          workflowRunId: runId,
        });
      } catch (error) {
        finalizationError = error;
      }
    }

    if (terminalState) {
      if (
        terminalState.status !== "canceled" &&
        terminalState.status !== "failed" &&
        terminalState.status !== "succeeded"
      ) {
        finalizationError = new Error("Chat terminal state was not persisted.");
      } else {
        try {
          await writeChatTerminalAndClose(
            writable,
            terminalState.status,
            terminalState.status === "failed"
              ? "Chat session failed."
              : undefined,
          );
        } catch (error) {
          finalizationError = error;
        }
      }
    }

    if (finalizationError) {
      try {
        await writeStreamClose(writable, "Chat session finalization failed.");
      } catch {
        // The terminal writer may already have closed the stream.
      }
      if (!thrownError) {
        thrownError = finalizationError;
      }
    }
  }

  if (thrownError !== null && thrownError !== undefined) {
    throw thrownError;
  }

  return { messages };
}
