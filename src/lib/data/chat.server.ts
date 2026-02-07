import "server-only";

import { desc, eq } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import type { ChatThreadStatus } from "@/lib/chat/thread-status";
import { AppError } from "@/lib/core/errors";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { isUndefinedTableError } from "@/lib/db/postgres-errors";

/** Chat thread status values shared with chat data DTOs and update helpers. */
export type { ChatThreadStatus } from "@/lib/chat/thread-status";

/**
 * JSON-safe chat thread DTO.
 */
export type ChatThreadDto = Readonly<{
  id: string;
  projectId: string;
  title: string;
  mode: string;
  status: ChatThreadStatus;
  workflowRunId: string | null;
  lastActivityAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

type ChatThreadRow = typeof schema.chatThreadsTable.$inferSelect;

function toChatThreadDto(row: ChatThreadRow): ChatThreadDto {
  return {
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    id: row.id,
    lastActivityAt: row.lastActivityAt.toISOString(),
    mode: row.mode,
    projectId: row.projectId,
    status: row.status,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    workflowRunId: row.workflowRunId ?? null,
  };
}

async function assertProjectAccess(projectId: string, userId: string) {
  const project = await getProjectByIdForUser(projectId, userId);
  if (!project) {
    throw new AppError("not_found", 404, "Project not found.");
  }
}

/**
 * Ensure a chat thread exists for a Workflow DevKit run id.
 *
 * @remarks
 * Idempotent: inserts on first call and returns the existing row on retries.
 *
 * @param input - Thread creation inputs.
 * @returns Chat thread DTO.
 * @throws AppError - With code "db_not_migrated" (500) when the database schema is missing.
 * @throws AppError - With code "db_insert_failed" (500) when the thread cannot be created or found.
 */
export async function ensureChatThreadForWorkflowRun(
  input: Readonly<{
    projectId: string;
    title: string;
    workflowRunId: string;
    mode: string;
  }>,
): Promise<ChatThreadDto> {
  const db = getDb();
  const now = new Date();

  let row: ChatThreadRow | undefined;
  try {
    [row] = await db
      .insert(schema.chatThreadsTable)
      .values({
        lastActivityAt: now,
        mode: input.mode,
        projectId: input.projectId,
        status: "running",
        title: input.title,
        updatedAt: now,
        workflowRunId: input.workflowRunId,
      })
      .onConflictDoNothing({ target: schema.chatThreadsTable.workflowRunId })
      .returning();
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw new AppError(
        "db_not_migrated",
        500,
        "Database is not migrated. Run migrations and try again.",
        error,
      );
    }
    throw error;
  }

  if (row) {
    return toChatThreadDto(row);
  }

  const existing = await db.query.chatThreadsTable.findFirst({
    where: eq(schema.chatThreadsTable.workflowRunId, input.workflowRunId),
  });

  if (!existing) {
    throw new AppError(
      "db_insert_failed",
      500,
      "Failed to create chat thread.",
    );
  }

  return toChatThreadDto(existing);
}

/**
 * Get a chat thread by Workflow DevKit run id (cached per request).
 *
 * @param workflowRunId - Workflow DevKit run id.
 * @returns Chat thread DTO or null.
 * @throws AppError - With code "db_not_migrated" (500) when the database schema is missing.
 */
export const getChatThreadByWorkflowRunId = cache(
  async (workflowRunId: string): Promise<ChatThreadDto | null> => {
    const db = getDb();
    try {
      const row = await db.query.chatThreadsTable.findFirst({
        where: eq(schema.chatThreadsTable.workflowRunId, workflowRunId),
      });
      return row ? toChatThreadDto(row) : null;
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
  },
);

/**
 * Get the most recently active chat thread for a project (cached per request).
 *
 * @param projectId - Project id.
 * @param userId - Authenticated user id used to validate project access.
 * @returns Latest chat thread DTO or null.
 * @throws AppError - With code "not_found" (404) when the project is not accessible.
 * @throws AppError - With code "db_not_migrated" (500) when the database schema is missing.
 */
export const getLatestChatThreadByProjectId = cache(
  async (projectId: string, userId: string): Promise<ChatThreadDto | null> => {
    await assertProjectAccess(projectId, userId);
    const db = getDb();
    try {
      const row = await db.query.chatThreadsTable.findFirst({
        orderBy: (t, { desc }) => [desc(t.lastActivityAt)],
        where: eq(schema.chatThreadsTable.projectId, projectId),
      });
      return row ? toChatThreadDto(row) : null;
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
  },
);

/**
 * List recent chat threads for a project (newest first).
 *
 * @param projectId - Project id.
 * @param userId - Authenticated user id used to validate project access.
 * @param options - Optional pagination options.
 * @returns Thread DTOs ordered by most recent activity.
 */
export const listChatThreadsByProjectId = cache(
  async (
    projectId: string,
    userId: string,
    options: Readonly<{ limit?: number }> = {},
  ): Promise<ChatThreadDto[]> => {
    await assertProjectAccess(projectId, userId);
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const db = getDb();

    try {
      const rows = await db.query.chatThreadsTable.findMany({
        limit,
        orderBy: (t) => [desc(t.lastActivityAt)],
        where: eq(schema.chatThreadsTable.projectId, projectId),
      });
      return rows.map(toChatThreadDto);
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
  },
);

/**
 * Get a single chat thread by its primary key.
 *
 * @param threadId - Chat thread ID.
 * @param userId - Authenticated user id used to validate project access.
 * @returns Thread DTO or null.
 */
export const getChatThreadById = cache(
  async (threadId: string, userId: string): Promise<ChatThreadDto | null> => {
    const db = getDb();
    try {
      const row = await db.query.chatThreadsTable.findFirst({
        where: eq(schema.chatThreadsTable.id, threadId),
      });
      if (!row) return null;
      await assertProjectAccess(row.projectId, userId);
      return toChatThreadDto(row);
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
  },
);

const uiMessageSchema = z.looseObject({
  id: z.string().min(1),
  parts: z.array(z.unknown()),
  role: z.enum(["assistant", "system", "user"]),
});

type PersistedUiMessage = z.infer<typeof uiMessageSchema>;

/**
 * JSON-safe chat message DTO.
 */
export type ChatMessageDto = Readonly<{
  id: string;
  threadId: string;
  role: string;
  messageUid: string | null;
  textContent: string | null;
  uiMessage: PersistedUiMessage | null;
  createdAt: string;
}>;

type ChatMessageRow = typeof schema.chatMessagesTable.$inferSelect;

function toChatMessageDto(row: ChatMessageRow): ChatMessageDto {
  const ui = row.uiMessage ? uiMessageSchema.safeParse(row.uiMessage) : null;
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    messageUid: row.messageUid ?? null,
    role: row.role,
    textContent: row.textContent ?? null,
    threadId: row.threadId,
    uiMessage: ui?.success ? ui.data : null,
  };
}

function extractTextContent(message: PersistedUiMessage): string {
  const parts = message.parts;
  const texts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const maybe = part as { type?: unknown; text?: unknown };
    if (maybe.type === "text" && typeof maybe.text === "string") {
      texts.push(maybe.text);
    }
  }
  return texts.join("");
}

/**
 * Append one or more UI messages to a chat thread (idempotent by messageUid).
 *
 * @param input - Append input.
 */
export async function appendChatMessages(
  input: Readonly<{
    threadId: string;
    messages: readonly PersistedUiMessage[];
  }>,
): Promise<void> {
  if (input.messages.length === 0) return;

  const db = getDb();
  const values = input.messages.map((m) => {
    const textContent = extractTextContent(m);
    return {
      content: textContent,
      messageUid: m.id,
      role: m.role,
      textContent: textContent.length > 0 ? textContent : null,
      threadId: input.threadId,
      uiMessage: m as unknown as Record<string, unknown>,
    };
  });

  try {
    await db
      .insert(schema.chatMessagesTable)
      .values(values)
      .onConflictDoNothing({
        target: [
          schema.chatMessagesTable.threadId,
          schema.chatMessagesTable.messageUid,
        ],
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

/**
 * List chat messages for a thread (oldest first).
 *
 * @param threadId - Thread id.
 * @param userId - Authenticated user id used to validate project access.
 * @param options - Optional pagination options.
 * @returns Message DTOs.
 */
export const listChatMessagesByThreadId = cache(
  async (
    threadId: string,
    userId: string,
    options: Readonly<{ limit?: number }> = {},
  ): Promise<ChatMessageDto[]> => {
    const thread = await getChatThreadById(threadId, userId);
    if (!thread) {
      throw new AppError("not_found", 404, "Chat thread not found.");
    }

    const db = getDb();
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);

    try {
      const rows = await db.query.chatMessagesTable.findMany({
        limit,
        orderBy: (t) => [t.createdAt],
        where: eq(schema.chatMessagesTable.threadId, thread.id),
      });
      return rows.map(toChatMessageDto);
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
  },
);

/**
 * Update a chat thread by workflow run id.
 *
 * @param workflowRunId - Workflow DevKit run id.
 * @param input - Partial update fields.
 * @throws AppError - With code "db_not_migrated" (500) when the database schema is missing.
 */
export async function updateChatThreadByWorkflowRunId(
  workflowRunId: string,
  input: Readonly<{
    endedAt?: Date | null;
    lastActivityAt?: Date;
    status?: ChatThreadStatus;
    title?: string;
  }>,
): Promise<void> {
  const db = getDb();
  const next = {
    ...(input.endedAt === undefined ? {} : { endedAt: input.endedAt }),
    ...(input.lastActivityAt === undefined
      ? {}
      : { lastActivityAt: input.lastActivityAt }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.title === undefined ? {} : { title: input.title }),
    updatedAt: new Date(),
  } satisfies Partial<ChatThreadRow>;

  try {
    await db
      .update(schema.chatThreadsTable)
      .set(next)
      .where(eq(schema.chatThreadsTable.workflowRunId, workflowRunId));
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw new AppError(
        "db_not_migrated",
        500,
        "Database is not migrated. Run migrations and try again.",
        error,
      );
    }
    throw error;
  }
}
