import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/db/client";

const state = vi.hoisted(() => ({
  db: null as unknown as DbClient,
}));

vi.mock("@/db/client", () => ({
  getDb: () => state.db,
}));

import {
  acceptChatFollowUp,
  inspectChatFollowUp,
} from "./chat-follow-up.server";

type MessageRow = {
  content: string;
  id: string;
  messageUid: string;
  role: string;
  textContent: string | null;
  threadId: string;
  uiMessage: unknown;
};

function createFakeDb() {
  const memory: {
    message: MessageRow | null;
    thread: {
      id: string;
      status: "running" | "waiting" | "canceled";
      updatedAt: Date;
    };
  } = {
    message: null,
    thread: {
      id: "thread_1",
      status: "waiting",
      updatedAt: new Date("2026-07-13T00:00:00.000Z"),
    },
  };
  const findThread = vi.fn(async () => ({ ...memory.thread }));
  const findMessage = vi.fn(async () =>
    memory.message ? { ...memory.message } : null,
  );
  const update = vi.fn(() => ({
    set: (values: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
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
  const insert = vi.fn(() => ({
    values: (values: Omit<MessageRow, "id">) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          if (memory.message) return [];
          memory.message = { ...values, id: "row_1" };
          return [{ id: "row_1" }];
        },
      }),
    }),
  }));
  const db = {
    insert,
    query: {
      chatMessagesTable: { findFirst: findMessage },
      chatThreadsTable: { findFirst: findThread },
    },
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(db),
    ),
    update,
  };
  return { db, insert, memory, update };
}

const waitingSince = "2026-07-13T00:00:00.000Z";

describe("durable chat follow-up consumption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("atomically persists a user delivery and moves its waiting generation to running", async () => {
    const fake = createFakeDb();
    state.db = fake.db as unknown as DbClient;

    await expect(
      acceptChatFollowUp({
        messageId: "message_1",
        payload: { message: "hello" },
        waitingSince,
        workflowRunId: "run_1",
      }),
    ).resolves.toEqual({ kind: "user", status: "accepted" });

    expect(fake.memory.thread.status).toBe("running");
    expect(fake.memory.message).toMatchObject({
      messageUid: "message_1",
      role: "user",
      textContent: "hello",
      uiMessage: {
        id: "message_1",
        parts: [{ text: "hello", type: "text" }],
        role: "user",
      },
    });
  });

  it("resumes a committed delivery after process death without a second DB mutation", async () => {
    const fake = createFakeDb();
    state.db = fake.db as unknown as DbClient;
    const input = {
      messageId: "message_1",
      payload: { message: "hello" },
      waitingSince,
      workflowRunId: "run_1",
    } as const;

    await expect(acceptChatFollowUp(input)).resolves.toEqual({
      kind: "user",
      status: "accepted",
    });
    await expect(acceptChatFollowUp(input)).resolves.toEqual({
      kind: "user",
      status: "resume_committed",
    });

    expect(fake.insert).toHaveBeenCalledTimes(1);
    expect(fake.update).toHaveBeenCalledTimes(1);
  });

  it("recognizes a later duplicate without repeating the completed turn", async () => {
    const fake = createFakeDb();
    state.db = fake.db as unknown as DbClient;
    const input = {
      messageId: "message_1",
      payload: { message: "hello" },
      waitingSince,
      workflowRunId: "run_1",
    } as const;

    await acceptChatFollowUp(input);
    fake.memory.thread.status = "waiting";
    fake.memory.thread.updatedAt = new Date("2026-07-13T00:01:00.000Z");

    await expect(acceptChatFollowUp(input)).resolves.toEqual({
      status: "already_committed",
    });
    expect(fake.insert).toHaveBeenCalledTimes(1);
    expect(fake.update).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched reuse without mutating transcript or thread state", async () => {
    const fake = createFakeDb();
    state.db = fake.db as unknown as DbClient;
    await acceptChatFollowUp({
      messageId: "message_1",
      payload: { message: "hello" },
      waitingSince,
      workflowRunId: "run_1",
    });
    fake.memory.thread.status = "waiting";
    const updateCount = fake.update.mock.calls.length;

    await expect(
      acceptChatFollowUp({
        messageId: "message_1",
        payload: { message: "changed" },
        waitingSince,
        workflowRunId: "run_1",
      }),
    ).resolves.toEqual({ status: "payload_mismatch" });

    expect(fake.update).toHaveBeenCalledTimes(updateCount);
    expect(fake.memory.message?.textContent).toBe("hello");
  });

  it("drops a different message queued for an obsolete waiting generation", async () => {
    const fake = createFakeDb();
    fake.memory.thread.updatedAt = new Date("2026-07-13T00:01:00.000Z");
    state.db = fake.db as unknown as DbClient;

    await expect(
      acceptChatFollowUp({
        messageId: "message_2",
        payload: { message: "stale" },
        waitingSince,
        workflowRunId: "run_1",
      }),
    ).resolves.toEqual({ status: "stale_delivery" });

    expect(fake.memory.message).toBeNull();
    expect(fake.update).not.toHaveBeenCalled();
  });

  it("persists /done as an invisible command receipt", async () => {
    const fake = createFakeDb();
    state.db = fake.db as unknown as DbClient;

    await expect(
      acceptChatFollowUp({
        messageId: "done_1",
        payload: { message: "/done" },
        waitingSince,
        workflowRunId: "run_1",
      }),
    ).resolves.toEqual({ kind: "command", status: "accepted" });

    expect(fake.memory.message).toMatchObject({
      role: "__chat_follow_up_command_v2",
      textContent: null,
      uiMessage: null,
    });
  });

  it("preflights exact retries and payload conflicts without writing", async () => {
    const fake = createFakeDb();
    state.db = fake.db as unknown as DbClient;
    await acceptChatFollowUp({
      messageId: "message_1",
      payload: { message: "hello" },
      waitingSince,
      workflowRunId: "run_1",
    });
    const updates = fake.update.mock.calls.length;

    await expect(
      inspectChatFollowUp({
        messageId: "message_1",
        payload: { message: "hello" },
        threadId: "thread_1",
      }),
    ).resolves.toBe("duplicate");
    await expect(
      inspectChatFollowUp({
        messageId: "message_1",
        payload: { message: "changed" },
        threadId: "thread_1",
      }),
    ).resolves.toBe("payload_mismatch");

    expect(fake.update).toHaveBeenCalledTimes(updates);
  });
});
