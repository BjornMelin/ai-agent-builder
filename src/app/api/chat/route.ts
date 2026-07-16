import {
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  type UIMessage,
} from "ai";
import { getRun, start } from "workflow/api";
import { z } from "zod";
import {
  getEnabledAgentMode,
  requestAgentModeIdSchema,
} from "@/lib/ai/agents/registry.server";
import { buildChatToolsForMode } from "@/lib/ai/tools/factory.server";
import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { isCanonicalInitialUserMessage } from "@/lib/chat/persisted-message";
import { toChatTitle } from "@/lib/chat/title";
import { AppError } from "@/lib/core/errors";
import {
  claimChatWorkflow,
  ensureChatStartIntent,
  getChatStartState,
} from "@/lib/data/chat-start.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonError } from "@/lib/next/responses";
import { projectChat } from "@/workflows/chat/project-chat.workflow";

type ProjectChatUIMessage = UIMessage;

const bodySchema = z.strictObject({
  message: z.unknown(),
  modeId: z.string().min(1).optional(),
  projectId: z.string().min(1),
  threadId: z.string().uuid(),
});

function streamChatRun(threadId: string, workflowRunId: string): Response {
  const run = getRun(workflowRunId);
  if (!run) {
    throw new AppError("not_found", 404, "Chat workflow not found.");
  }
  return createUIMessageStreamResponse({
    headers: {
      "x-chat-thread-id": threadId,
      "x-workflow-run-id": workflowRunId,
    },
    stream: run.readable,
  });
}

/**
 * Start a durable multi-turn chat session for a project.
 *
 * @remarks
 * Returns a streaming UIMessageChunk response with the persisted
 * `x-chat-thread-id` and durable `x-workflow-run-id` identities so the client
 * can resume or reconnect to the same session.
 *
 * @param req - HTTP request.
 * @returns UI message stream response or JSON error.
 * @throws AppError - When request auth, body, or message validation fails.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const authPromise = requireAppUserApi();
    const bodyPromise = parseJsonBody(req, bodySchema);
    const [user, parsed] = await Promise.all([authPromise, bodyPromise]);

    const project = await getProjectByIdForUser(parsed.projectId, user.id);
    if (!project) {
      throw new AppError("not_found", 404, "Project not found.");
    }

    const modeId = requestAgentModeIdSchema.parse(parsed.modeId);
    // Validate mode is usable (feature-gated) before starting the run.
    getEnabledAgentMode(modeId);

    const tools = buildChatToolsForMode(modeId);

    const validated = await safeValidateUIMessages<ProjectChatUIMessage>({
      messages: [parsed.message],
      // ToolSet is structurally compatible with the UI validation tool type,
      // but the AI SDK types are not directly assignable with exact optional
      // property types enabled.
      tools: tools as unknown as NonNullable<
        Parameters<
          typeof safeValidateUIMessages<ProjectChatUIMessage>
        >[0]["tools"]
      >,
    });
    if (!validated.success) {
      throw new AppError(
        "bad_request",
        400,
        "Invalid UI message.",
        validated.error,
      );
    }

    const [message] = validated.data;
    if (
      validated.data.length !== 1 ||
      !isCanonicalInitialUserMessage(message)
    ) {
      throw new AppError(
        "bad_request",
        400,
        "A chat must start with one meaningful text/file user message.",
      );
    }

    const title = toChatTitle(message);
    const threadId = parsed.threadId;
    const intent = await ensureChatStartIntent({
      message,
      mode: modeId,
      projectId: parsed.projectId,
      threadId,
      title,
      userId: user.id,
    });
    if (intent.workflowRunId) {
      return streamChatRun(threadId, intent.workflowRunId);
    }

    let startedRun: Awaited<ReturnType<typeof start>>;
    try {
      startedRun = await start(projectChat, [
        parsed.projectId,
        message,
        modeId,
        threadId,
      ]);
      await claimChatWorkflow(threadId, startedRun.runId);
    } catch (error) {
      const recovered = await getChatStartState(threadId);
      if (recovered?.workflowRunId) {
        return streamChatRun(threadId, recovered.workflowRunId);
      }
      throw error;
    }

    const canonical = await getChatStartState(threadId);
    if (!canonical?.workflowRunId) {
      await startedRun.cancel().catch(() => undefined);
      throw new AppError(
        "chat_start_unavailable",
        409,
        "Chat workflow registration is not available.",
      );
    }
    if (canonical.workflowRunId !== startedRun.runId) {
      await startedRun.cancel().catch(() => undefined);
    }

    return streamChatRun(threadId, canonical.workflowRunId);
  } catch (err) {
    return jsonError(err);
  }
}
