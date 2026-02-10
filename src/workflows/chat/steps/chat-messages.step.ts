import type { UIMessage } from "ai";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import { appendChatMessages } from "@/lib/data/chat.server";
import { maybeWrapDbNotMigrated } from "@/lib/db/postgres-errors";

type PersistedUiMessage = Parameters<
  typeof appendChatMessages
>[0]["messages"][number];

/**
 * Validate and extract persistence fields from an AI SDK {@link UIMessage}.
 *
 * @param message - The UI message to validate.
 * @returns Validated persistence payload.
 * @throws AppError - With code `"invalid_message"` when required fields are missing.
 */
function validateUiMessage(message: UIMessage): PersistedUiMessage {
  const id = message.id;
  const parts = message.parts;
  const role = message.role;

  if (typeof id !== "string" || id.length === 0) {
    throw new AppError("invalid_message", 400, "Message missing required id.");
  }
  if (!Array.isArray(parts)) {
    throw new AppError(
      "invalid_message",
      400,
      "Message missing required parts.",
    );
  }
  if (role !== "assistant" && role !== "system" && role !== "user") {
    throw new AppError(
      "invalid_message",
      400,
      "Message missing required role.",
    );
  }

  return { id, parts, role };
}

/**
 * Persist UI messages for a workflow-backed chat thread.
 *
 * @remarks
 * Runs as a step because DB writes must not occur in `"use workflow"` functions. (SPEC-0004)
 *
 * @param input - Persistence payload.
 * @throws AppError - When the chat thread is missing or the database is not migrated.
 * @see docs/architecture/spec/SPEC-0004-chat-retrieval-augmentation.md
 */
export async function persistChatMessagesForWorkflowRun(
  input: Readonly<{
    workflowRunId: string;
    messages: readonly UIMessage[];
  }>,
): Promise<void> {
  "use step";

  if (input.messages.length === 0) return;

  const db = getDb();

  try {
    const thread = await db.query.chatThreadsTable.findFirst({
      columns: { id: true },
      where: eq(schema.chatThreadsTable.workflowRunId, input.workflowRunId),
    });

    if (!thread) {
      throw new AppError("not_found", 404, "Chat thread not found.");
    }

    await appendChatMessages({
      messages: input.messages.map((m) => validateUiMessage(m)),
      threadId: thread.id,
    });
  } catch (error) {
    throw maybeWrapDbNotMigrated(error);
  }
}
