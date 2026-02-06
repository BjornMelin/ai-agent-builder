import { getRun } from "workflow/api";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import {
  getChatThreadByWorkflowRunId,
  updateChatThreadByWorkflowRunId,
} from "@/lib/data/chat.server";
import { getProjectById } from "@/lib/data/projects.server";
import { jsonError, jsonOk } from "@/lib/next/responses";

/**
 * Cancel an in-flight chat session workflow run.
 *
 * @param _req - HTTP request.
 * @param context - Route params.
 * @returns JSON ok or JSON error.
 * @throws AppError - With code "not_found" when the chat session cannot be found.
 * @throws AppError - With code "not_found" when the workflow run cannot be found.
 * @throws AppError - With code "conflict" when the session is no longer active.
 * @throws AppError - With code "forbidden" when the session's project is not accessible.
 */
export async function POST(
  _req: Request,
  context: Readonly<{ params: Promise<{ runId: string }> }>,
): Promise<Response> {
  try {
    const authPromise = requireAppUserApi();
    const paramsPromise = context.params;
    const [_authenticatedUser, params] = await Promise.all([
      authPromise,
      paramsPromise,
    ]);

    const thread = await getChatThreadByWorkflowRunId(params.runId);
    if (!thread) {
      throw new AppError("not_found", 404, "Chat session not found.");
    }

    const project = await getProjectById(thread.projectId);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    if (
      thread.status === "succeeded" ||
      thread.status === "failed" ||
      thread.status === "canceled"
    ) {
      throw new AppError("conflict", 409, "Chat session is no longer active.");
    }

    const run = getRun(params.runId);
    if (!run) {
      throw new AppError("not_found", 404, "Run not found.");
    }

    await run.cancel();

    const now = new Date();
    try {
      await updateChatThreadByWorkflowRunId(params.runId, {
        endedAt: now,
        lastActivityAt: now,
        status: "canceled",
      });
    } catch (updateError) {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          "[api/chat/:runId/cancel] Workflow canceled but state update failed.",
          updateError,
        );
      }
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
