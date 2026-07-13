import { getRun } from "workflow/api";
import { getWorld } from "workflow/runtime";
import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { getChatThreadByWorkflowRunId } from "@/lib/data/chat.server";
import { transitionChatThreadState } from "@/lib/data/chat-thread-state.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { jsonError, jsonOk } from "@/lib/next/responses";

async function closeWorkflowRunStreams(runId: string): Promise<void> {
  const world = getWorld();
  const streamNames = await world.listStreamsByRunId(runId);
  await Promise.all(
    streamNames.map(async (name) => await world.closeStream(name, runId)),
  );
}

/**
 * Cancel an in-flight chat session workflow run.
 *
 * @param _req - HTTP request.
 * @param context - Route params.
 * @returns The authoritative terminal status or a JSON error.
 * @throws AppError - With code "not_found" when the chat session cannot be found.
 * @throws AppError - With code "not_found" when the workflow run cannot be found.
 * @throws AppError - With code "conflict" when cancellation does not reach a terminal state.
 * @throws AppError - With code "forbidden" when the session's project is not accessible.
 */
export async function POST(
  _req: Request,
  context: Readonly<{ params: Promise<{ runId: string }> }>,
): Promise<Response> {
  try {
    const authPromise = requireAppUserApi();
    const paramsPromise = context.params;
    const [user, params] = await Promise.all([authPromise, paramsPromise]);

    const thread = await getChatThreadByWorkflowRunId(params.runId);
    if (!thread) {
      throw new AppError("not_found", 404, "Chat session not found.");
    }

    const project = await getProjectByIdForUser(thread.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    if (thread.status === "succeeded" || thread.status === "failed") {
      return jsonOk({ ok: true, status: thread.status });
    }

    const run = getRun(params.runId);
    if (!run) {
      throw new AppError("not_found", 404, "Run not found.");
    }

    const terminalStatus =
      thread.status === "canceled"
        ? "canceled"
        : (
            await transitionChatThreadState({
              status: "canceled",
              workflowRunId: params.runId,
            })
          ).status;

    if (
      terminalStatus !== "succeeded" &&
      terminalStatus !== "failed" &&
      terminalStatus !== "canceled"
    ) {
      throw new AppError(
        "conflict",
        409,
        "Chat cancellation has not reached a terminal state.",
      );
    }

    if (terminalStatus === "canceled") {
      await run.cancel();
      await closeWorkflowRunStreams(params.runId);
    }

    return jsonOk({ ok: true, status: terminalStatus });
  } catch (err) {
    return jsonError(err);
  }
}
