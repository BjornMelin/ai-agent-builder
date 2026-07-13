import "server-only";

import { and, eq } from "drizzle-orm";

import { type DbClient, getDb } from "@/db/client";
import * as schema from "@/db/schema";
import type { ChatThreadStatus } from "@/lib/chat/thread-status";
import { AppError } from "@/lib/core/errors";
import { maybeWrapDbNotMigrated } from "@/lib/db/postgres-errors";

const TERMINAL_CHAT_STATUSES = new Set<ChatThreadStatus>([
  "canceled",
  "failed",
  "succeeded",
]);

/** Result of one terminal-monotonic chat-thread transition. */
export type ChatThreadTransitionResult = Readonly<{
  changed: boolean;
  id: string;
  status: ChatThreadStatus;
  updatedAt: Date;
}>;

/** Input accepted by the canonical chat-thread transition owner. */
export type ChatThreadTransitionInput = Readonly<{
  endedAt?: Date | null;
  expectedStatus?: ChatThreadStatus;
  expectedUpdatedAt?: Date;
  status: ChatThreadStatus;
  workflowRunId: string;
}>;

/**
 * Determine whether a chat-thread status is terminal and immutable.
 *
 * @param status - Persisted chat-thread status.
 * @returns Whether the status is terminal.
 */
export function isTerminalChatThreadStatus(
  status: ChatThreadStatus,
): status is "canceled" | "failed" | "succeeded" {
  return TERMINAL_CHAT_STATUSES.has(status);
}

async function findThreadState(tx: DbClient, workflowRunId: string) {
  return await tx.query.chatThreadsTable.findFirst({
    columns: { id: true, status: true, updatedAt: true },
    where: eq(schema.chatThreadsTable.workflowRunId, workflowRunId),
  });
}

/**
 * Apply a chat-thread transition inside an existing transaction.
 *
 * @remarks
 * Terminal states are immutable. The status and timestamp predicates make the
 * update a compare-and-swap, so cancellation and workflow finalization cannot
 * overwrite one another.
 *
 * @param tx - Existing database transaction.
 * @param input - Requested transition and optional compare-and-swap predicates.
 * @returns The authoritative persisted state after the transition attempt.
 * @throws AppError - When the chat thread does not exist.
 */
export async function transitionChatThreadStateTx(
  tx: DbClient,
  input: ChatThreadTransitionInput,
): Promise<ChatThreadTransitionResult> {
  const current = await findThreadState(tx, input.workflowRunId);
  if (!current) {
    throw new AppError("not_found", 404, "Chat thread not found.");
  }

  const expectedTimestampMatches =
    input.expectedUpdatedAt === undefined ||
    current.updatedAt.getTime() === input.expectedUpdatedAt.getTime();
  const expectedStatusMatches =
    input.expectedStatus === undefined ||
    current.status === input.expectedStatus;

  if (
    isTerminalChatThreadStatus(current.status) ||
    !expectedTimestampMatches ||
    !expectedStatusMatches
  ) {
    return { ...current, changed: false };
  }

  const now = new Date();
  const terminal = isTerminalChatThreadStatus(input.status);
  const [updated] = await tx
    .update(schema.chatThreadsTable)
    .set({
      ...(input.endedAt === undefined
        ? terminal
          ? { endedAt: now }
          : {}
        : { endedAt: input.endedAt }),
      lastActivityAt: now,
      status: input.status,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.chatThreadsTable.workflowRunId, input.workflowRunId),
        eq(schema.chatThreadsTable.status, current.status),
        eq(schema.chatThreadsTable.updatedAt, current.updatedAt),
      ),
    )
    .returning({
      id: schema.chatThreadsTable.id,
      status: schema.chatThreadsTable.status,
      updatedAt: schema.chatThreadsTable.updatedAt,
    });

  if (updated) {
    return { ...updated, changed: true };
  }

  const authoritative = await findThreadState(tx, input.workflowRunId);
  if (!authoritative) {
    throw new AppError("not_found", 404, "Chat thread not found.");
  }
  return { ...authoritative, changed: false };
}

/**
 * Apply the canonical terminal-monotonic chat-thread state transition.
 *
 * @param input - Requested transition and optional compare-and-swap predicates.
 * @returns The authoritative persisted state after the transition attempt.
 */
export async function transitionChatThreadState(
  input: ChatThreadTransitionInput,
): Promise<ChatThreadTransitionResult> {
  const db = getDb();
  try {
    return await db.transaction(
      async (tx) => await transitionChatThreadStateTx(tx as DbClient, input),
    );
  } catch (error) {
    throw maybeWrapDbNotMigrated(error);
  }
}
