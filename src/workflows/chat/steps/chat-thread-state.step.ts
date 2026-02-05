import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import type { ChatThreadStatus } from "@/lib/data/chat.server";

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
    status: input.status,
    updatedAt: now,
  };

  await db
    .insert(schema.chatThreadsTable)
    .values({
      ...stateUpdate,
      projectId: input.projectId,
      title: input.title,
      workflowRunId: input.workflowRunId,
    })
    .onConflictDoUpdate({
      set: stateUpdate,
      target: schema.chatThreadsTable.workflowRunId,
    });
}
