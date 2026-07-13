import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { getChatThreadByWorkflowRunId } from "@/lib/data/chat.server";
import { inspectChatFollowUp } from "@/lib/data/chat-follow-up.server";
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
    messageId: z.string().min(1).max(128),
  })
  .superRefine((value, ctx) => {
    if (!value.message && !value.files) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either message or files.",
        path: ["message"],
      });
    }
    if (value.messageId.startsWith("assistant:")) {
      ctx.addIssue({
        code: "custom",
        message: "Message ID uses a reserved server namespace.",
        path: ["messageId"],
      });
    }
  });

/**
 * Read the authoritative persisted lifecycle for stream reconciliation.
 *
 * @param _req - HTTP request.
 * @param context - Route params.
 * @returns Authenticated chat identity and lifecycle state.
 */
export async function GET(
  _req: Request,
  context: Readonly<{ params: Promise<{ runId: string }> }>,
): Promise<Response> {
  try {
    const [user, params] = await Promise.all([
      requireAppUserApi(),
      context.params,
    ]);
    const thread = await getChatThreadByWorkflowRunId(params.runId);
    if (!thread) {
      throw new AppError("not_found", 404, "Chat session not found.");
    }
    const project = await getProjectByIdForUser(thread.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    return jsonOk({
      status: thread.status,
      threadId: thread.id,
      workflowRunId: params.runId,
    });
  } catch (error) {
    return jsonError(error);
  }
}

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
 * @throws AppError - With code "chat_message_id_conflict" when the id has another payload.
 * @throws AppError - With code "chat_session_busy" when the session is not waiting.
 * @throws AppError - With code "chat_session_terminal" when the session has ended.
 * @throws AppError - With code "chat_hook_unavailable" when the hook is not registered.
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

        const normalized = {
          mediaType,
          type: file.type,
          url: url.toString(),
        } as const;
        return file.filename === undefined
          ? normalized
          : { ...normalized, filename: file.filename };
      } catch (err) {
        // `parseTrustedProjectUploadBlobUrl` throws `blob_fetch_failed` (502) for
        // fetch-time flows. Here it's user input validation; return 400 instead.
        throw new AppError("bad_request", 400, "Invalid attachment URL.", err);
      }
    });

    const payload = {
      ...(safeFiles?.length ? { files: safeFiles } : {}),
      ...(parsed.message ? { message: parsed.message } : {}),
    };
    const inspection = await inspectChatFollowUp({
      messageId: parsed.messageId,
      payload,
      threadId: thread.id,
    });
    if (inspection === "duplicate") {
      return jsonOk({ ok: true, status: "duplicate" as const });
    }
    if (inspection === "payload_mismatch") {
      throw new AppError(
        "chat_message_id_conflict",
        409,
        "messageId is already bound to a different payload.",
      );
    }
    if (
      thread.status === "succeeded" ||
      thread.status === "failed" ||
      thread.status === "canceled"
    ) {
      throw new AppError(
        "chat_session_terminal",
        409,
        `Chat session is ${thread.status}.`,
      );
    }
    if (thread.status !== "waiting") {
      throw new AppError(
        "chat_session_busy",
        409,
        "Chat session is processing another turn.",
      );
    }

    const resumedHook = await chatMessageHook.resume(params.runId, {
      ...(safeFiles?.length ? { files: safeFiles } : {}),
      ...(parsed.message ? { message: parsed.message } : {}),
      messageId: parsed.messageId,
      schemaVersion: 2,
      waitingSince: thread.updatedAt,
    });
    if (!resumedHook) {
      throw new AppError(
        "chat_hook_unavailable",
        409,
        "Chat session is not ready to receive a follow-up.",
      );
    }

    return jsonOk({ ok: true, status: "queued" as const }, { status: 202 });
  } catch (err) {
    return jsonError(err);
  }
}
