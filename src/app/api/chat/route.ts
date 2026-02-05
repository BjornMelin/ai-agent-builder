import {
  createUIMessageStreamResponse,
  type InferUITools,
  safeValidateUIMessages,
  type UIMessage,
} from "ai";
import { getRun, start } from "workflow/api";
import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import { ensureChatThreadForWorkflowRun } from "@/lib/data/chat.server";
import { getProjectById } from "@/lib/data/projects.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonError } from "@/lib/next/responses";
import { projectChat } from "@/workflows/chat/project-chat.workflow";
import { chatTools } from "@/workflows/chat/tools";

type ProjectChatUIMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof chatTools>
>;

const bodySchema = z.strictObject({
  messages: z.array(z.unknown()),
  projectId: z.string().min(1),
});

function toChatTitle(message: ProjectChatUIMessage): string {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();

  if (text.length === 0) {
    return "New chat";
  }

  const normalized = text.replace(/\s+/g, " ");
  return normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized;
}

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
    const [, parsed] = await Promise.all([authPromise, bodyPromise]);

    const project = await getProjectById(parsed.projectId);
    if (!project) {
      throw new AppError("not_found", 404, "Project not found.");
    }

    const validated = await safeValidateUIMessages<ProjectChatUIMessage>({
      messages: parsed.messages,
      tools: chatTools,
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

    const run = await start(projectChat, [parsed.projectId, validated.data]);
    try {
      await ensureChatThreadForWorkflowRun({
        projectId: parsed.projectId,
        title: toChatTitle(last),
        workflowRunId: run.runId,
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

    return createUIMessageStreamResponse({
      headers: { "x-workflow-run-id": run.runId },
      stream: run.readable,
    });
  } catch (err) {
    return jsonError(err);
  }
}
