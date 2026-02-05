import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import type { ChatThreadStatus } from "@/lib/data/chat.server";

type TouchInput = Readonly<{
  status: ChatThreadStatus;
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

  await db
    .update(schema.chatThreadsTable)
    .set({
      ...(input.endedAt === undefined ? {} : { endedAt: input.endedAt }),
      lastActivityAt: now,
      status: input.status,
      updatedAt: now,
    })
    .where(eq(schema.chatThreadsTable.workflowRunId, input.workflowRunId));
}
