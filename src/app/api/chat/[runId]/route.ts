import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import {
  getChatThreadByWorkflowRunId,
  updateChatThreadByWorkflowRunId,
} from "@/lib/data/chat.server";
import { getProjectById } from "@/lib/data/projects.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { chatMessageHook } from "@/workflows/chat/hooks/chat-message";

const bodySchema = z.strictObject({
  message: z.string().min(1),
});

/**
 * Resume an in-flight multi-turn chat run by injecting a follow-up message.
 *
 * @param req - HTTP request.
 * @param context - Route params.
 * @returns JSON ok or JSON error.
 * @throws AppError - When the request body is invalid.
 * @throws AppError - With code "not_found" when the chat session cannot be found.
 * @throws AppError - With code "conflict" when the chat session is no longer active.
 * @throws AppError - With code "forbidden" when the session's project is not accessible.
 */
export async function POST(
  req: Request,
  context: Readonly<{ params: Promise<{ runId: string }> }>,
) {
  try {
    const authPromise = requireAppUserApi();
    const paramsPromise = context.params;
    const bodyPromise = parseJsonBody(req, bodySchema);

    const [params, parsed, _authenticatedUser] = await Promise.all([
      paramsPromise,
      bodyPromise,
      authPromise,
    ]);

    const thread = await getChatThreadByWorkflowRunId(params.runId);
    if (!thread) {
      throw new AppError("not_found", 404, "Chat session not found.");
    }

    if (
      thread.status === "succeeded" ||
      thread.status === "failed" ||
      thread.status === "canceled"
    ) {
      throw new AppError("conflict", 409, "Chat session is not active.");
    }

    const project = await getProjectById(thread.projectId);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    await chatMessageHook.resume(params.runId, { message: parsed.message });

    const now = new Date();
    try {
      await updateChatThreadByWorkflowRunId(params.runId, {
        lastActivityAt: now,
        status: parsed.message === "/done" ? "waiting" : "running",
      });
    } catch (updateError) {
      log.error("chat_resume_state_update_failed", {
        action: "resume",
        err: updateError,
        runId: params.runId,
      });
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
