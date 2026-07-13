import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/db/client";

const state = vi.hoisted(() => ({
  db: null as unknown as DbClient,
}));

vi.mock("@/db/client", () => ({
  getDb: () => state.db,
}));

import { transitionChatThreadState } from "./chat-thread-state.server";

function createFakeDb(options?: Readonly<{ loseCasToCanceled?: boolean }>) {
  const memory = {
    thread: {
      id: "thread_1",
      status: "running" as
        | "running"
        | "waiting"
        | "succeeded"
        | "failed"
        | "canceled",
      updatedAt: new Date("2026-07-13T00:00:00.000Z"),
    },
  };
  const findFirst = vi.fn(async () => ({ ...memory.thread }));
  const update = vi.fn(() => ({
    set: (values: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
          if (options?.loseCasToCanceled) {
            memory.thread = {
              ...memory.thread,
              status: "canceled",
              updatedAt: new Date("2026-07-13T00:00:02.000Z"),
            };
            return [];
          }
          memory.thread = {
            ...memory.thread,
            status: values.status as typeof memory.thread.status,
            updatedAt: values.updatedAt as Date,
          };
          return [{ ...memory.thread }];
        },
      }),
    }),
  }));
  const db = {
    query: { chatThreadsTable: { findFirst } },
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(db),
    ),
    update,
  };
  return { db, findFirst, memory, update };
}

describe("transitionChatThreadState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists a terminal state and makes it immutable", async () => {
    const fake = createFakeDb();
    state.db = fake.db as unknown as DbClient;

    await expect(
      transitionChatThreadState({
        status: "succeeded",
        workflowRunId: "run_1",
      }),
    ).resolves.toMatchObject({ changed: true, status: "succeeded" });
    await expect(
      transitionChatThreadState({
        status: "canceled",
        workflowRunId: "run_1",
      }),
    ).resolves.toMatchObject({ changed: false, status: "succeeded" });

    expect(fake.update).toHaveBeenCalledTimes(1);
  });

  it("returns the authoritative terminal winner after a compare-and-swap race", async () => {
    const fake = createFakeDb({ loseCasToCanceled: true });
    state.db = fake.db as unknown as DbClient;

    await expect(
      transitionChatThreadState({
        status: "succeeded",
        workflowRunId: "run_1",
      }),
    ).resolves.toMatchObject({ changed: false, status: "canceled" });
  });

  it("does not mutate when a waiting-generation precondition is stale", async () => {
    const fake = createFakeDb();
    fake.memory.thread.status = "waiting";
    state.db = fake.db as unknown as DbClient;

    await expect(
      transitionChatThreadState({
        expectedStatus: "waiting",
        expectedUpdatedAt: new Date("2026-07-12T23:59:59.000Z"),
        status: "running",
        workflowRunId: "run_1",
      }),
    ).resolves.toMatchObject({ changed: false, status: "waiting" });

    expect(fake.update).not.toHaveBeenCalled();
  });
});
