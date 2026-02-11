import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import {
  appendChatMessages,
  getChatThreadByWorkflowRunId,
  updateChatThreadByWorkflowRunId,
} from "@/lib/data/chat.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { allowedUploadMimeTypeSet } from "@/lib/uploads/allowed-mime-types";
import { parseTrustedProjectUploadBlobUrl } from "@/lib/uploads/trusted-blob-url.server";
import { chatMessageHook } from "@/workflows/chat/hooks/chat-message";

const filePartSchema = z.strictObject({
  filename: z.string().min(1).optional(),
  mediaType: z.string().min(1),
  type: z.literal("file"),
  url: z.string().min(1),
});

const bodySchema = z
  .strictObject({
    files: z.array(filePartSchema).min(1).optional(),
    message: z.string().trim().min(1).optional(),
    messageId: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (!value.message && !value.files) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either message or files.",
        path: ["message"],
      });
    }
  });

/**
 * Resume an in-flight multi-turn chat run by injecting a follow-up user message
 * with optional attachments.
 *
 * @param req - HTTP request.
 * @param context - Route params.
 * @returns JSON ok or JSON error.
 * @throws AppError - When the request body is invalid.
 * @throws AppError - With code "unsupported_file_type" when an attachment media type is rejected.
 * @throws AppError - With code "bad_request" when an attachment URL is invalid.
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

    const [params, parsed, user] = await Promise.all([
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

    const project = await getProjectByIdForUser(thread.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    const safeFiles = parsed.files?.map((file) => {
      const mediaType = file.mediaType.trim().toLowerCase();
      if (!allowedUploadMimeTypeSet.has(mediaType)) {
        throw new AppError(
          "unsupported_file_type",
          400,
          `Unsupported file type: ${mediaType}`,
        );
      }

      try {
        // Ensures attachments are hosted on trusted Vercel Blob URLs and scoped
        // to this chat session's project prefix.
        const url = parseTrustedProjectUploadBlobUrl({
          projectId: thread.projectId,
          urlString: file.url.trim(),
        });

        return { ...file, mediaType, url: url.toString() };
      } catch (err) {
        // `parseTrustedProjectUploadBlobUrl` throws `blob_fetch_failed` (502) for
        // fetch-time flows. Here it's user input validation; return 400 instead.
        throw new AppError("bad_request", 400, "Invalid attachment URL.", err);
      }
    });

    await appendChatMessages({
      messages: [
        {
          id: parsed.messageId,
          parts: [
            ...(safeFiles ?? []),
            ...(parsed.message ? [{ text: parsed.message, type: "text" }] : []),
          ],
          role: "user",
        },
      ],
      threadId: thread.id,
    });

    await chatMessageHook.resume(params.runId, {
      ...(safeFiles?.length ? { files: safeFiles } : {}),
      ...(parsed.message ? { message: parsed.message } : {}),
      messageId: parsed.messageId,
    });

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
