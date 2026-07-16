import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@/db/client", () => ({ getDb: () => state.db }));

const input = {
  message: {
    id: "user_1",
    parts: [{ text: "hello", type: "text" }],
    role: "user",
  } as const,
  mode: "architect",
  projectId: "project_1",
  threadId: "00000000-0000-4000-8000-000000000001",
  title: "hello",
  userId: "user_1",
};

function threadRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    createdAt: new Date(0),
    endedAt: null,
    id: input.threadId,
    lastActivityAt: new Date(0),
    mode: input.mode,
    projectId: input.projectId,
    status: "pending",
    title: input.title,
    updatedAt: new Date(0),
    workflowRunId: null,
    ...overrides,
  };
}

function createIntentDb(options?: {
  created?: boolean;
  persistedReceipt?: Record<string, unknown>;
  row?: Record<string, unknown>;
}) {
  const row = options?.row ?? threadRow();
  const threadReturning = vi
    .fn()
    .mockResolvedValue(options?.created === false ? [] : [row]);
  const messageOnConflict = vi.fn().mockResolvedValue(undefined);
  const threadValues = vi.fn(() => ({
    onConflictDoNothing: () => ({ returning: threadReturning }),
  }));
  const messageValues = vi.fn(() => ({
    onConflictDoNothing: messageOnConflict,
  }));
  let insertCount = 0;
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn(() => {
      insertCount += 1;
      return { values: insertCount === 1 ? threadValues : messageValues };
    }),
    query: {
      chatMessagesTable: {
        findFirst: vi.fn().mockResolvedValue(
          options?.persistedReceipt ?? {
            role: "__chat_start_intent_v1",
            uiMessage: { message: input.message, schemaVersion: 1 },
          },
        ),
      },
      chatThreadsTable: {
        findFirst: vi.fn().mockResolvedValue(row),
      },
      projectsTable: {
        findFirst: vi.fn().mockResolvedValue({ status: "active" }),
      },
    },
  };
  const db = {
    transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        await callback(tx),
    ),
  };
  return { db, messageValues, threadValues };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("ensureChatStartIntent", () => {
  it("rejects a non-user start payload before opening a transaction", async () => {
    const fake = createIntentDb();
    state.db = fake.db;
    const { ensureChatStartIntent } = await import("./chat-start.server");

    await expect(
      ensureChatStartIntent({
        ...input,
        message: { ...input.message, role: "assistant" },
      }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
    expect(fake.db.transaction).not.toHaveBeenCalled();
  });

  it("persists the client-known thread and immutable initial user message before dispatch", async () => {
    const fake = createIntentDb();
    state.db = fake.db;
    const { ensureChatStartIntent } = await import("./chat-start.server");

    await expect(ensureChatStartIntent(input)).resolves.toEqual({
      id: input.threadId,
      projectId: input.projectId,
      status: "pending",
      workflowRunId: null,
    });
    expect(fake.threadValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: input.threadId,
        status: "pending",
        workflowRunId: null,
      }),
    );
    expect(fake.messageValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          content: "hello",
          messageUid: "user_1",
          threadId: input.threadId,
        }),
        expect.objectContaining({
          messageUid: "chat-start-intent:v1",
          role: "__chat_start_intent_v1",
          threadId: input.threadId,
          uiMessage: { message: input.message, schemaVersion: 1 },
        }),
      ]),
    );
  });

  it("accepts an exact retry after the same intent committed", async () => {
    const fake = createIntentDb({ created: false });
    state.db = fake.db;
    const { ensureChatStartIntent } = await import("./chat-start.server");

    await expect(ensureChatStartIntent(input)).resolves.toMatchObject({
      id: input.threadId,
      workflowRunId: null,
    });
    expect(fake.messageValues).not.toHaveBeenCalled();
  });

  it("rejects a reused thread identity carrying different messages", async () => {
    const fake = createIntentDb({
      created: false,
      persistedReceipt: {
        role: "__chat_start_intent_v1",
        uiMessage: {
          message: {
            id: "user_1",
            parts: [{ text: "different", type: "text" }],
            role: "user",
          },
          schemaVersion: 1,
        },
      },
    });
    state.db = fake.db;
    const { ensureChatStartIntent } = await import("./chat-start.server");

    await expect(ensureChatStartIntent(input)).rejects.toMatchObject({
      code: "chat_start_conflict",
      status: 409,
    });
  });

  it("rejects a retry with a different initial user identity", async () => {
    const fake = createIntentDb({
      created: false,
      persistedReceipt: {
        role: "__chat_start_intent_v1",
        uiMessage: {
          message: { ...input.message, id: "different_user_message" },
          schemaVersion: 1,
        },
      },
    });
    state.db = fake.db;
    const { ensureChatStartIntent } = await import("./chat-start.server");

    await expect(ensureChatStartIntent(input)).rejects.toMatchObject({
      code: "chat_start_conflict",
      status: 409,
    });
  });
});

describe("claimChatWorkflow", () => {
  it("returns true only for the atomic Workflow owner", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: input.threadId }]);
    state.db = {
      query: { chatThreadsTable: { findFirst: vi.fn() } },
      update: () => ({
        set: () => ({ where: () => ({ returning }) }),
      }),
    };
    const { claimChatWorkflow } = await import("./chat-start.server");

    await expect(
      claimChatWorkflow(input.threadId, "workflow_winner"),
    ).resolves.toBe(true);
  });

  it("accepts the same owner retry and fences a duplicate Workflow", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      status: "running",
      workflowRunId: "workflow_winner",
    });
    state.db = {
      query: { chatThreadsTable: { findFirst } },
      update: () => ({
        set: () => ({
          where: () => ({ returning: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    };
    const { claimChatWorkflow } = await import("./chat-start.server");

    await expect(
      claimChatWorkflow(input.threadId, "workflow_winner"),
    ).resolves.toBe(true);
    await expect(
      claimChatWorkflow(input.threadId, "workflow_loser"),
    ).resolves.toBe(false);
  });
});
