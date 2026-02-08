import type { UIMessage } from "ai";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import { appendChatMessages } from "@/lib/data/chat.server";
import { isUndefinedTableError } from "@/lib/db/postgres-errors";

/**
 * Persist UI messages for a workflow-backed chat thread.
 *
 * @remarks
 * Runs as a step because DB writes must not occur in `"use workflow"` functions. (SPEC-0004)
 *
 * @see docs/architecture/spec/SPEC-0004-chat-retrieval-augmentation.md
 *
 * @param input - Persistence payload.
 * @throws AppError - When the chat thread is missing or the database is not migrated.
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
      messages: input.messages as unknown as Parameters<
        typeof appendChatMessages
      >[0]["messages"],
      threadId: thread.id,
    });
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw new AppError(
        "db_not_migrated",
        500,
        "Database is not migrated. Run migrations and refresh the page.",
        error,
      );
    }
    throw error;
  }
}
