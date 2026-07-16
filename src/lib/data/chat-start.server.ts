import "server-only";

import { isDeepStrictEqual } from "node:util";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import {
  CHAT_START_INTENT_MESSAGE_ID,
  isCanonicalInitialUserMessage,
  type PersistableChatMessage,
  toChatMessageInsertValues,
} from "@/lib/chat/persisted-message";
import type { ChatThreadStatus } from "@/lib/chat/thread-status";
import { AppError } from "@/lib/core/errors";
import { maybeWrapDbNotMigrated } from "@/lib/db/postgres-errors";

const TERMINAL_CHAT_STATUSES = ["canceled", "failed", "succeeded"] as const;
const START_INTENT_ROLE = "__chat_start_intent_v1";

/** Canonical identity and lifecycle state for a chat start intent. */
export type ChatStartState = Readonly<{
  id: string;
  projectId: string;
  status: ChatThreadStatus;
  workflowRunId: string | null;
}>;

type ChatStartIntent = Readonly<{
  message: PersistableChatMessage;
  mode: string;
  projectId: string;
  threadId: string;
  title: string;
  userId: string;
}>;

function toStartState(
  row: typeof schema.chatThreadsTable.$inferSelect,
): ChatStartState {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    workflowRunId: row.workflowRunId ?? null,
  };
}

function assertInitialUserMessage(message: PersistableChatMessage) {
  if (!isCanonicalInitialUserMessage(message)) {
    throw new AppError(
      "bad_request",
      400,
      "A chat must start with one meaningful text/file user message.",
    );
  }
}

function startIntentReceipt(input: ChatStartIntent) {
  return {
    message: input.message,
    schemaVersion: 1,
  } as const;
}

/**
 * Persist a client-known chat thread and its immutable start payload.
 *
 * @remarks
 * The transaction commits before Workflow dispatch. Reusing the UUID is
 * idempotent only for the same project, mode, title, and validated user message.
 * This gives an ambiguous POST a durable identity that either the route or the
 * workflow can attach to its generated Workflow run ID.
 *
 * @param input - Authenticated immutable chat start request.
 * @returns Canonical start state.
 * @throws AppError - With code "bad_request" when the initial message is invalid.
 * @throws AppError - With code "db_insert_failed" when persistence cannot be confirmed.
 * @throws AppError - With code "chat_start_conflict" when the ID has another payload.
 * @throws unknown - Re-throws database failures; missing-schema failures are wrapped as AppError.
 */
export async function ensureChatStartIntent(
  input: ChatStartIntent,
): Promise<ChatStartState> {
  assertInitialUserMessage(input.message);
  const db = getDb();

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.projectId}, 0))`,
      );
      const project = await tx.query.projectsTable.findFirst({
        columns: { status: true },
        where: and(
          eq(schema.projectsTable.id, input.projectId),
          eq(schema.projectsTable.ownerUserId, input.userId),
        ),
      });
      if (!project) {
        throw new AppError("project_not_found", 404, "Project not found.");
      }
      if (project.status !== "active") {
        throw new AppError(
          "project_not_active",
          409,
          "Restore the project before starting new work.",
        );
      }
      const now = new Date();
      const [created] = await tx
        .insert(schema.chatThreadsTable)
        .values({
          id: input.threadId,
          lastActivityAt: now,
          mode: input.mode,
          projectId: input.projectId,
          status: "pending",
          title: input.title,
          updatedAt: now,
          workflowRunId: null,
        })
        .onConflictDoNothing({ target: schema.chatThreadsTable.id })
        .returning();

      const row =
        created ??
        (await tx.query.chatThreadsTable.findFirst({
          where: eq(schema.chatThreadsTable.id, input.threadId),
        }));
      if (!row) {
        throw new AppError(
          "db_insert_failed",
          500,
          "Failed to create chat start intent.",
        );
      }
      if (
        row.projectId !== input.projectId ||
        row.mode !== input.mode ||
        row.title !== input.title
      ) {
        throw new AppError(
          "chat_start_conflict",
          409,
          "The chat thread ID belongs to a different request.",
        );
      }

      if (created) {
        const messageValues = toChatMessageInsertValues(
          [input.message],
          input.threadId,
        );
        await tx
          .insert(schema.chatMessagesTable)
          .values([
            ...messageValues,
            {
              content: "chat-start-intent:v1",
              messageUid: CHAT_START_INTENT_MESSAGE_ID,
              role: START_INTENT_ROLE,
              textContent: null,
              threadId: input.threadId,
              uiMessage: startIntentReceipt(input),
            },
          ])
          .onConflictDoNothing({
            target: [
              schema.chatMessagesTable.threadId,
              schema.chatMessagesTable.messageUid,
            ],
          });
      } else {
        const receipt = await tx.query.chatMessagesTable.findFirst({
          columns: { role: true, uiMessage: true },
          where: and(
            eq(schema.chatMessagesTable.threadId, input.threadId),
            eq(
              schema.chatMessagesTable.messageUid,
              CHAT_START_INTENT_MESSAGE_ID,
            ),
          ),
        });
        if (
          receipt?.role !== START_INTENT_ROLE ||
          !isDeepStrictEqual(receipt.uiMessage, startIntentReceipt(input))
        ) {
          throw new AppError(
            "chat_start_conflict",
            409,
            "The chat thread ID belongs to a different request.",
          );
        }
      }

      return toStartState(row);
    });
  } catch (error) {
    throw maybeWrapDbNotMigrated(error);
  }
}

/**
 * Attach exactly one Workflow run to a client-known chat thread.
 *
 * @param threadId - Client-generated canonical thread UUID.
 * @param workflowRunId - Native Workflow execution attempting ownership.
 * @returns Whether this Workflow owns the nonterminal thread.
 * @throws unknown - Re-throws database failures; missing-schema failures are wrapped as AppError.
 */
export async function claimChatWorkflow(
  threadId: string,
  workflowRunId: string,
): Promise<boolean> {
  const db = getDb();
  try {
    const now = new Date();
    const [claimed] = await db
      .update(schema.chatThreadsTable)
      .set({
        lastActivityAt: now,
        status: "running",
        updatedAt: now,
        workflowRunId,
      })
      .where(
        and(
          eq(schema.chatThreadsTable.id, threadId),
          isNull(schema.chatThreadsTable.workflowRunId),
          notInArray(schema.chatThreadsTable.status, [
            ...TERMINAL_CHAT_STATUSES,
          ]),
        ),
      )
      .returning({ id: schema.chatThreadsTable.id });
    if (claimed) return true;

    const existing = await db.query.chatThreadsTable.findFirst({
      columns: { status: true, workflowRunId: true },
      where: eq(schema.chatThreadsTable.id, threadId),
    });
    return (
      existing?.workflowRunId === workflowRunId &&
      !TERMINAL_CHAT_STATUSES.some((terminal) => terminal === existing.status)
    );
  } catch (error) {
    throw maybeWrapDbNotMigrated(error);
  }
}

/**
 * Read internal chat start state without request-level caching.
 *
 * @param threadId - Client-known chat thread UUID.
 * @returns Current state or `null`.
 * @throws unknown - Re-throws database failures; missing-schema failures are wrapped as AppError.
 */
export async function getChatStartState(
  threadId: string,
): Promise<ChatStartState | null> {
  const db = getDb();
  try {
    const row = await db.query.chatThreadsTable.findFirst({
      where: eq(schema.chatThreadsTable.id, threadId),
    });
    return row ? toStartState(row) : null;
  } catch (error) {
    throw maybeWrapDbNotMigrated(error);
  }
}
