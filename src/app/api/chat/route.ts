import {
  createUIMessageStreamResponse,
  type InferUITools,
  safeValidateUIMessages,
  type UIMessage,
} from "ai";
import { start } from "workflow/api";
import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
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

/**
 * Start a durable multi-turn chat session for a project.
 *
 * @remarks
 * Returns a streaming UIMessageChunk response and includes `x-workflow-run-id`
 * so the client can resume/reconnect to the same stream.
 *
 * @param req - HTTP request.
 * @returns UI message stream response or JSON error.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const authPromise = requireAppUserApi();
    const bodyPromise = req.json().catch(() => null);
    await authPromise;

    const raw = await bodyPromise;
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("bad_request", 400, "Invalid request body.");
    }

    const validated = await safeValidateUIMessages<ProjectChatUIMessage>({
      messages: parsed.data.messages,
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

    const run = await start(projectChat, [
      parsed.data.projectId,
      validated.data,
    ]);

    return createUIMessageStreamResponse({
      headers: { "x-workflow-run-id": run.runId },
      stream: run.readable,
    });
  } catch (err) {
    return jsonError(err);
  }
}
