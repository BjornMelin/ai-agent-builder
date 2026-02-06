import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import type { ChatThreadStatus } from "@/lib/chat/thread-status";

type TouchInput = Readonly<{
  projectId: string;
  status: ChatThreadStatus;
  title: string;
  workflowRunId: string;
  endedAt?: Date | null;
}>;

/**
 * Persist chat thread lifecycle state (status/activity/end).
 *
 * @remarks
 * This is a workflow step because DB writes must not occur in `"use workflow"`
 * orchestrator functions.
 *
 * @param input - Update payload.
 */
export async function touchChatThreadState(input: TouchInput): Promise<void> {
  "use step";

  const db = getDb();
  const now = new Date();
  const stateUpdate = {
    ...(input.endedAt === undefined ? {} : { endedAt: input.endedAt }),
    lastActivityAt: now,
    projectId: input.projectId,
    status: input.status,
    title: input.title,
    updatedAt: now,
  };

  await db
    .insert(schema.chatThreadsTable)
    .values({
      ...stateUpdate,
      workflowRunId: input.workflowRunId,
    })
    .onConflictDoUpdate({
      set: stateUpdate,
      target: schema.chatThreadsTable.workflowRunId,
    });
}
