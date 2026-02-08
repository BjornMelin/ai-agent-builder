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
import { toChatTitle } from "@/lib/chat/title";
import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import {
  appendChatMessages,
  ensureChatThreadForWorkflowRun,
} from "@/lib/data/chat.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonError } from "@/lib/next/responses";
import { projectChat } from "@/workflows/chat/project-chat.workflow";

type ProjectChatUIMessage = UIMessage;

const bodySchema = z.strictObject({
  messages: z.array(z.unknown()),
  modeId: z.string().min(1).optional(),
  projectId: z.string().min(1),
});

/**
 * Start a durable multi-turn chat session for a project.
 *
 * @remarks
 * Returns a streaming UIMessageChunk response and includes `x-workflow-run-id`
 * so the client can resume/reconnect to the same stream.
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
      messages: parsed.messages,
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
        "Invalid UI messages.",
        validated.error,
      );
    }

    const last = validated.data.at(-1);
    if (!last || last.role !== "user") {
      throw new AppError(
        "bad_request",
        400,
        "Last message must be a user message.",
      );
    }

    const title = toChatTitle(last);
    const run = await start(projectChat, [
      parsed.projectId,
      validated.data,
      title,
      modeId,
    ]);
    try {
      const thread = await ensureChatThreadForWorkflowRun({
        mode: modeId,
        projectId: parsed.projectId,
        title,
        workflowRunId: run.runId,
      });

      await appendChatMessages({
        messages: validated.data as unknown as Parameters<
          typeof appendChatMessages
        >[0]["messages"],
        threadId: thread.id,
      });

      return createUIMessageStreamResponse({
        headers: {
          "x-chat-thread-id": thread.id,
          "x-workflow-run-id": run.runId,
        },
        stream: run.readable,
      });
    } catch (error) {
      try {
        await getRun(run.runId).cancel();
      } catch (cancelError) {
        log.error("workflow_run_cancel_failed", {
          err: cancelError,
          projectId: parsed.projectId,
          workflowRunId: run.runId,
        });
      }
      throw error;
    }
  } catch (err) {
    return jsonError(err);
  }
}
