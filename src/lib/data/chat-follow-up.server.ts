import "server-only";

import type { FileUIPart, UIMessage } from "ai";
import { and, eq } from "drizzle-orm";

import { type DbClient, getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import {
  isTerminalChatThreadStatus,
  transitionChatThreadStateTx,
} from "@/lib/data/chat-thread-state.server";
import { maybeWrapDbNotMigrated } from "@/lib/db/postgres-errors";

const COMMAND_ROLE = "__chat_follow_up_command_v2";
const RECEIPT_PREFIX = "chat-follow-up:v2:";

/** Content whose identity is bound to a durable chat hook delivery. */
export type ChatFollowUpPayload = Readonly<{
  files?: readonly FileUIPart[] | undefined;
  message?: string | undefined;
}>;

/** Read-only route preflight for a follow-up message identity. */
export type ChatFollowUpInspection =
  | "available"
  | "duplicate"
  | "payload_mismatch";

/** Workflow-owned result of accepting one durable hook delivery. */
export type ChatFollowUpAcceptance =
  | Readonly<{
      kind: "command" | "user";
      status: "accepted" | "resume_committed";
    }>
  | Readonly<{
      status:
        | "already_committed"
        | "not_waiting"
        | "payload_mismatch"
        | "stale_delivery"
        | "terminal";
    }>;

function canonicalizePayload(payload: ChatFollowUpPayload): string {
  return JSON.stringify({
    files:
      payload.files?.map((file) => ({
        ...(file.filename === undefined ? {} : { filename: file.filename }),
        mediaType: file.mediaType,
        type: "file" as const,
        url: file.url,
      })) ?? null,
    message: payload.message ?? null,
    schemaVersion: 2,
  });
}

function receiptContent(payload: ChatFollowUpPayload): string {
  return `${RECEIPT_PREFIX}${canonicalizePayload(payload)}`;
}

function followUpKind(payload: ChatFollowUpPayload): "command" | "user" {
  return payload.message === "/done" ? "command" : "user";
}

function expectedRole(payload: ChatFollowUpPayload): string {
  return followUpKind(payload) === "command" ? COMMAND_ROLE : "user";
}

function classifyExisting(
  existing: Readonly<{ content: string; role: string }>,
  payload: ChatFollowUpPayload,
): Exclude<ChatFollowUpInspection, "available"> {
  return existing.content === receiptContent(payload) &&
    existing.role === expectedRole(payload)
    ? "duplicate"
    : "payload_mismatch";
}

async function findMessage(tx: DbClient, threadId: string, messageId: string) {
  return await tx.query.chatMessagesTable.findFirst({
    columns: { content: true, role: true },
    where: and(
      eq(schema.chatMessagesTable.threadId, threadId),
      eq(schema.chatMessagesTable.messageUid, messageId),
    ),
  });
}

/**
 * Inspect an authenticated follow-up message ID without reserving or mutating it.
 *
 * @param input - Persisted thread, message ID, and normalized payload.
 * @returns Whether the ID is unused, an exact retry, or a payload conflict.
 * @throws unknown - Re-throws database failures; missing-schema failures are wrapped as AppError.
 */
export async function inspectChatFollowUp(
  input: Readonly<{
    messageId: string;
    payload: ChatFollowUpPayload;
    threadId: string;
  }>,
): Promise<ChatFollowUpInspection> {
  const db = getDb();
  try {
    const existing = await findMessage(
      db as DbClient,
      input.threadId,
      input.messageId,
    );
    return existing ? classifyExisting(existing, input.payload) : "available";
  } catch (error) {
    throw maybeWrapDbNotMigrated(error);
  }
}

function createUserMessage(
  messageId: string,
  payload: ChatFollowUpPayload,
): UIMessage {
  return {
    id: messageId,
    parts: [
      ...(payload.files ?? []),
      ...(payload.message
        ? [{ text: payload.message, type: "text" as const }]
        : []),
    ],
    role: "user",
  };
}

/**
 * Atomically accept and persist one durable reusable-hook delivery.
 *
 * @remarks
 * The Workflow event log is the inbox. This transaction is its idempotent
 * consumer: it conditionally moves the matching waiting generation to running
 * and writes the accepted message before any marker or model side effect.
 *
 * @param input - Hook payload plus the waiting-generation timestamp observed by the route.
 * @returns Whether this delivery was accepted or must be skipped.
 * @throws AppError - With code "invalid_message" for a reserved ID or invalid generation.
 * @throws AppError - With code "not_found" when the chat thread does not exist.
 * @throws AppError - With code "conflict" when acceptance loses an insert race.
 * @throws unknown - Re-throws database failures; missing-schema failures are wrapped as AppError.
 */
export async function acceptChatFollowUp(
  input: Readonly<{
    messageId: string;
    payload: ChatFollowUpPayload;
    waitingSince: string;
    workflowRunId: string;
  }>,
): Promise<ChatFollowUpAcceptance> {
  if (input.messageId.startsWith("assistant:")) {
    throw new AppError(
      "invalid_message",
      400,
      "Message ID uses a reserved server namespace.",
    );
  }

  const expectedUpdatedAt = new Date(input.waitingSince);
  if (Number.isNaN(expectedUpdatedAt.getTime())) {
    throw new AppError("invalid_message", 400, "Invalid waiting generation.");
  }

  const db = getDb();
  try {
    return await db.transaction(async (rawTx) => {
      const tx = rawTx as DbClient;
      const thread = await tx.query.chatThreadsTable.findFirst({
        columns: { id: true, status: true },
        where: eq(schema.chatThreadsTable.workflowRunId, input.workflowRunId),
      });
      if (!thread) {
        throw new AppError("not_found", 404, "Chat thread not found.");
      }

      const existing = await findMessage(tx, thread.id, input.messageId);
      if (existing) {
        if (classifyExisting(existing, input.payload) === "payload_mismatch") {
          return { status: "payload_mismatch" as const };
        }

        // A process can die after this transaction commits but before the
        // Workflow runtime records the step result. `running` is the durable
        // evidence that this delivery owns the current turn, so replay must
        // continue its marker/model side effects. A later duplicate is only
        // observed after the turn returns to `waiting` and remains a no-op.
        return thread.status === "running"
          ? {
              kind: followUpKind(input.payload),
              status: "resume_committed" as const,
            }
          : { status: "already_committed" as const };
      }

      const transition = await transitionChatThreadStateTx(tx, {
        expectedStatus: "waiting",
        expectedUpdatedAt,
        status: "running",
        workflowRunId: input.workflowRunId,
      });
      if (!transition.changed) {
        if (isTerminalChatThreadStatus(transition.status)) {
          return { status: "terminal" as const };
        }
        if (transition.status !== "waiting") {
          return { status: "not_waiting" as const };
        }
        return { status: "stale_delivery" as const };
      }

      const kind = followUpKind(input.payload);
      const message =
        kind === "user"
          ? createUserMessage(input.messageId, input.payload)
          : null;
      const textContent = input.payload.message ?? "";
      const [inserted] = await tx
        .insert(schema.chatMessagesTable)
        .values({
          content: receiptContent(input.payload),
          messageUid: input.messageId,
          role: kind === "command" ? COMMAND_ROLE : "user",
          textContent:
            kind === "user" && textContent.length > 0 ? textContent : null,
          threadId: thread.id,
          uiMessage: message,
        })
        .onConflictDoNothing({
          target: [
            schema.chatMessagesTable.threadId,
            schema.chatMessagesTable.messageUid,
          ],
        })
        .returning({ id: schema.chatMessagesTable.id });

      if (!inserted) {
        throw new AppError(
          "conflict",
          409,
          "Chat follow-up changed during acceptance.",
        );
      }

      return { kind, status: "accepted" as const };
    });
  } catch (error) {
    throw maybeWrapDbNotMigrated(error);
  }
}
