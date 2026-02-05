import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/db/client";
import * as schema from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown as DbClient,
}));

vi.mock("@/db/client", () => ({
  getDb: () => state.db,
}));

import { touchChatThreadState } from "./chat-thread-state.step";

function createFakeDb() {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });

  const db = { insert };
  return { db, insert, onConflictDoUpdate, values };
}

function assertIsDate(value: unknown): asserts value is Date {
  expect(value).toBeInstanceOf(Date);
}

describe("chat-thread-state.step", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("upserts chat thread state with terminal metadata when endedAt is provided", async () => {
    const { db, insert, onConflictDoUpdate, values } = createFakeDb();
    state.db = db as unknown as DbClient;

    await touchChatThreadState({
      endedAt: new Date(1_000),
      projectId: "project_1",
      status: "failed",
      title: "Thread title",
      workflowRunId: "wf_1",
    });

    expect(insert).toHaveBeenCalledWith(schema.chatThreadsTable);
    expect(values).toHaveBeenCalledTimes(1);

    const valuesArg = values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(valuesArg).toMatchObject({
      endedAt: new Date(1_000),
      projectId: "project_1",
      status: "failed",
      title: "Thread title",
      workflowRunId: "wf_1",
    });
    assertIsDate(valuesArg.lastActivityAt);
    assertIsDate(valuesArg.updatedAt);
    expect(valuesArg.lastActivityAt.getTime()).toBe(0);
    expect(valuesArg.updatedAt.getTime()).toBe(0);

    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    const conflictArg = onConflictDoUpdate.mock.calls[0]?.[0] as {
      set: Record<string, unknown>;
      target: unknown;
    };
    expect(conflictArg.target).toBe(schema.chatThreadsTable.workflowRunId);
    expect(conflictArg.set).toMatchObject({
      endedAt: new Date(1_000),
      status: "failed",
    });
    assertIsDate(conflictArg.set.lastActivityAt);
    assertIsDate(conflictArg.set.updatedAt);
  });

  it("omits endedAt when the thread remains active", async () => {
    const { db, onConflictDoUpdate, values } = createFakeDb();
    state.db = db as unknown as DbClient;

    await touchChatThreadState({
      projectId: "project_1",
      status: "running",
      title: "Thread title",
      workflowRunId: "wf_1",
    });

    const valuesArg = values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect("endedAt" in valuesArg).toBe(false);

    const conflictArg = onConflictDoUpdate.mock.calls[0]?.[0] as {
      set: Record<string, unknown>;
    };
    expect("endedAt" in conflictArg.set).toBe(false);
  });
});
