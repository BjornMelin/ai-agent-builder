import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

type ThreadRow = Readonly<{
  id: string;
  projectId: string;
  title: string;
  mode: string;
  status: "running" | "waiting" | "succeeded" | "failed" | "canceled";
  workflowRunId: string | null;
  lastActivityAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

type MessageRow = Readonly<{
  id: string;
  threadId: string;
  role: string;
  messageUid: string | null;
  textContent: string | null;
  uiMessage: Record<string, unknown> | null;
  createdAt: Date;
}>;

const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof createFakeDb>,
  getProjectByIdForUser:
    vi.fn<
      (projectId: string, userId: string) => Promise<{ id: string } | null>
    >(),
  isUndefinedTableError: vi.fn<(err: unknown) => boolean>(),
  lastChatMessagesFindManyLimit: null as number | null,
  lastChatThreadsFindManyLimit: null as number | null,
  lastUpdateSetValues: null as Record<string, unknown> | null,
  messageInsertCalls: 0,
  messageInsertError: null as unknown,
  messages: [] as MessageRow[],
  nextMessageId: 1,
  nextThreadId: 1,
  threadFindFirstError: null as unknown,
  threadFindFirstQueue: [] as Array<ThreadRow | null>,
  threadInsertError: null as unknown,
  threadsById: new Map<string, ThreadRow>(),
  threadsByWorkflowRunId: new Map<string, ThreadRow>(),
}));

function createFakeDb() {
  return {
    insert: (_table: unknown) => ({
      values: (input: unknown) => {
        const values = Array.isArray(input) ? input : [input];
        const first = values[0] as Record<string, unknown> | undefined;

        if (first && "workflowRunId" in first) {
          // chat_threads insert
          const v = values[0] as Record<string, unknown>;
          return {
            onConflictDoNothing: (_opts: unknown) => ({
              returning: async () => {
                if (state.threadInsertError) {
                  throw state.threadInsertError;
                }
                const workflowRunId = String(v.workflowRunId ?? "");
                if (workflowRunId.length === 0) return [];
                if (state.threadsByWorkflowRunId.has(workflowRunId)) {
                  return [];
                }

                const now = new Date();
                const row: ThreadRow = {
                  createdAt: now,
                  endedAt: null,
                  id: `thread_${state.nextThreadId++}`,
                  lastActivityAt: (v.lastActivityAt as Date | undefined) ?? now,
                  mode: String(v.mode ?? "chat-assistant"),
                  projectId: String(v.projectId ?? "proj_1"),
                  status: (v.status as ThreadRow["status"]) ?? "running",
                  title: String(v.title ?? "Untitled"),
                  updatedAt: (v.updatedAt as Date | undefined) ?? now,
                  workflowRunId,
                };

                state.threadsByWorkflowRunId.set(workflowRunId, row);
                state.threadsById.set(row.id, row);
                return [row];
              },
            }),
          };
        }

        // chat_messages insert
        return {
          onConflictDoNothing: async (_opts: unknown) => {
            state.messageInsertCalls += 1;
            if (state.messageInsertError) {
              throw state.messageInsertError;
            }
            for (const raw of values) {
              const v = raw as Record<string, unknown>;
              const threadId = String(v.threadId ?? "");
              const messageUid = String(v.messageUid ?? "");
              const key = `${threadId}:${messageUid}`;
              const exists = state.messages.some(
                (m) => `${m.threadId}:${m.messageUid ?? ""}` === key,
              );
              if (exists) continue;

              const now = new Date(state.nextMessageId);
              state.messages.push({
                createdAt: now,
                id: `msg_${state.nextMessageId++}`,
                messageUid: messageUid.length > 0 ? messageUid : null,
                role: String(v.role ?? "user"),
                textContent:
                  typeof v.textContent === "string" && v.textContent.length > 0
                    ? v.textContent
                    : null,
                threadId,
                uiMessage:
                  v.uiMessage && typeof v.uiMessage === "object"
                    ? (v.uiMessage as Record<string, unknown>)
                    : null,
              });
            }
          },
        };
      },
    }),
    query: {
      chatMessagesTable: {
        findMany: async (opts: unknown) => {
          const limit =
            opts && typeof opts === "object"
              ? (opts as { limit?: unknown }).limit
              : undefined;
          state.lastChatMessagesFindManyLimit =
            typeof limit === "number" ? limit : null;
          return state.messages
            .slice()
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        },
      },
      chatThreadsTable: {
        findFirst: async (_opts: unknown) => {
          if (state.threadFindFirstError) {
            throw state.threadFindFirstError;
          }
          if (state.threadFindFirstQueue.length > 0) {
            const next = state.threadFindFirstQueue.shift();
            return next ?? null;
          }
          const first = state.threadsById.values().next().value;
          return first ?? null;
        },
        findMany: async (opts: unknown) => {
          const limit =
            opts && typeof opts === "object"
              ? (opts as { limit?: unknown }).limit
              : undefined;
          state.lastChatThreadsFindManyLimit =
            typeof limit === "number" ? limit : null;
          return Array.from(state.threadsById.values());
        },
      },
    },
    update: (_table: unknown) => ({
      set: (values: unknown) => {
        if (values && typeof values === "object") {
          state.lastUpdateSetValues = values as Record<string, unknown>;
        } else {
          state.lastUpdateSetValues = null;
        }
        return {
          where: async (_where: unknown) => {},
        };
      },
    }),
  };
}

vi.mock("@/db/client", () => ({
  getDb: () => state.db,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: (projectId: string, userId: string) =>
    state.getProjectByIdForUser(projectId, userId),
}));

vi.mock("@/lib/db/postgres-errors", () => ({
  isUndefinedTableError: (err: unknown) => state.isUndefinedTableError(err),
}));

vi.mock("react", () => ({
  cache: <TArgs extends readonly unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ) => fn,
}));

async function loadChatDal() {
  vi.resetModules();
  return await import("@/lib/data/chat.server");
}

beforeEach(() => {
  state.db = createFakeDb();
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.isUndefinedTableError.mockReturnValue(false);

  state.lastChatMessagesFindManyLimit = null;
  state.lastChatThreadsFindManyLimit = null;
  state.lastUpdateSetValues = null;
  state.messages = [];
  state.messageInsertError = null;
  state.messageInsertCalls = 0;
  state.nextMessageId = 1;
  state.nextThreadId = 1;
  state.threadFindFirstError = null;
  state.threadFindFirstQueue = [];
  state.threadInsertError = null;
  state.threadsById.clear();
  state.threadsByWorkflowRunId.clear();
});

describe("chat DAL", () => {
  it("persists thread mode when ensuring a thread for a workflow run", async () => {
    const { ensureChatThreadForWorkflowRun } = await loadChatDal();

    const thread = await ensureChatThreadForWorkflowRun({
      mode: "researcher",
      projectId: "proj_1",
      title: "Test thread",
      workflowRunId: "run_1",
    });

    expect(thread.mode).toBe("researcher");
    expect(thread.workflowRunId).toBe("run_1");
  });

  it("falls back to selecting an existing thread when insert is a no-op", async () => {
    const { ensureChatThreadForWorkflowRun } = await loadChatDal();

    const first = await ensureChatThreadForWorkflowRun({
      mode: "chat-assistant",
      projectId: "proj_1",
      title: "Test thread",
      workflowRunId: "run_1",
    });

    const second = await ensureChatThreadForWorkflowRun({
      mode: "chat-assistant",
      projectId: "proj_1",
      title: "Test thread",
      workflowRunId: "run_1",
    });

    expect(second.id).toBe(first.id);
    expect(second.workflowRunId).toBe("run_1");
  });

  it("throws db_insert_failed when insert is a no-op and no existing thread is found", async () => {
    const { ensureChatThreadForWorkflowRun } = await loadChatDal();

    // Seed an existing run to force insert to return []...
    await ensureChatThreadForWorkflowRun({
      mode: "chat-assistant",
      projectId: "proj_1",
      title: "Test thread",
      workflowRunId: "run_1",
    });
    // ...but then force the subsequent select to return null.
    state.threadFindFirstQueue.push(null);

    await expect(
      ensureChatThreadForWorkflowRun({
        mode: "chat-assistant",
        projectId: "proj_1",
        title: "Test thread",
        workflowRunId: "run_1",
      }),
    ).rejects.toMatchObject({
      code: "db_insert_failed",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("wraps undefined-table insert errors as db_not_migrated", async () => {
    const { ensureChatThreadForWorkflowRun } = await loadChatDal();

    const err = new Error("missing table");
    state.threadInsertError = err;
    state.isUndefinedTableError.mockReturnValueOnce(true);

    await expect(
      ensureChatThreadForWorkflowRun({
        mode: "chat-assistant",
        projectId: "proj_1",
        title: "Test thread",
        workflowRunId: "run_1",
      }),
    ).rejects.toMatchObject({
      cause: err,
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("dedupes messages by (threadId, messageUid)", async () => {
    const {
      appendChatMessages,
      ensureChatThreadForWorkflowRun,
      listChatMessagesByThreadId,
    } = await loadChatDal();

    const thread = await ensureChatThreadForWorkflowRun({
      mode: "chat-assistant",
      projectId: "proj_1",
      title: "Test thread",
      workflowRunId: "run_1",
    });

    await appendChatMessages({
      messages: [
        { id: "m1", parts: [{ text: "hello", type: "text" }], role: "user" },
      ],
      threadId: thread.id,
    });

    await appendChatMessages({
      messages: [
        { id: "m1", parts: [{ text: "hello", type: "text" }], role: "user" },
      ],
      threadId: thread.id,
    });

    const rows = await listChatMessagesByThreadId(thread.id, "user_1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.messageUid).toBe("m1");
  });

  it("extracts only text parts and sets null when there is no text content", async () => {
    const {
      appendChatMessages,
      ensureChatThreadForWorkflowRun,
      listChatMessagesByThreadId,
    } = await loadChatDal();

    const thread = await ensureChatThreadForWorkflowRun({
      mode: "chat-assistant",
      projectId: "proj_1",
      title: "Test thread",
      workflowRunId: "run_1",
    });

    await appendChatMessages({
      messages: [
        {
          id: "m1",
          parts: [
            null,
            "bad",
            { text: "ignore missing type" },
            { text: "nope", type: "image" },
            { text: "hi", type: "text" },
            { text: " there", type: "text" },
          ],
          role: "user",
        },
        {
          id: "m2",
          parts: [{ text: "x", type: "image" }],
          role: "user",
        },
      ],
      threadId: thread.id,
    });

    const rows = await listChatMessagesByThreadId(thread.id, "user_1");
    expect(rows.map((r) => r.textContent)).toEqual(["hi there", null]);
  });

  it("no-ops appendChatMessages for empty messages", async () => {
    const { appendChatMessages } = await loadChatDal();

    await appendChatMessages({ messages: [], threadId: "thread_1" });
    expect(state.messageInsertCalls).toBe(0);
  });

  it("wraps undefined-table insert errors for chat messages as db_not_migrated", async () => {
    const { appendChatMessages } = await loadChatDal();

    const err = new Error("missing table");
    state.messageInsertError = err;
    state.isUndefinedTableError.mockReturnValueOnce(true);

    await expect(
      appendChatMessages({
        messages: [
          { id: "m1", parts: [{ text: "hello", type: "text" }], role: "user" },
        ],
        threadId: "thread_1",
      }),
    ).rejects.toMatchObject({
      cause: err,
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("lists messages oldest-first", async () => {
    const {
      appendChatMessages,
      ensureChatThreadForWorkflowRun,
      listChatMessagesByThreadId,
    } = await loadChatDal();

    const thread = await ensureChatThreadForWorkflowRun({
      mode: "chat-assistant",
      projectId: "proj_1",
      title: "Test thread",
      workflowRunId: "run_1",
    });

    await appendChatMessages({
      messages: [
        { id: "m1", parts: [{ text: "one", type: "text" }], role: "user" },
        { id: "m2", parts: [{ text: "two", type: "text" }], role: "user" },
      ],
      threadId: thread.id,
    });

    const rows = await listChatMessagesByThreadId(thread.id, "user_1");
    expect(rows.map((r) => r.messageUid)).toEqual(["m1", "m2"]);
  });

  it("throws not_found when listing messages for a missing thread", async () => {
    const { listChatMessagesByThreadId } = await loadChatDal();
    state.threadFindFirstQueue.push(null);

    await expect(
      listChatMessagesByThreadId("thread_missing", "user_1"),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<AppError>);
  });

  it("clamps thread and message list limits", async () => {
    const {
      ensureChatThreadForWorkflowRun,
      listChatMessagesByThreadId,
      listChatThreadsByProjectId,
    } = await loadChatDal();

    const thread = await ensureChatThreadForWorkflowRun({
      mode: "chat-assistant",
      projectId: "proj_1",
      title: "Test thread",
      workflowRunId: "run_1",
    });

    await listChatThreadsByProjectId("proj_1", "user_1", { limit: 0 });
    expect(state.lastChatThreadsFindManyLimit).toBe(1);

    await listChatThreadsByProjectId("proj_1", "user_1", { limit: 999 });
    expect(state.lastChatThreadsFindManyLimit).toBe(200);

    await listChatMessagesByThreadId(thread.id, "user_1", { limit: 0 });
    expect(state.lastChatMessagesFindManyLimit).toBe(1);

    await listChatMessagesByThreadId(thread.id, "user_1", { limit: 999 });
    expect(state.lastChatMessagesFindManyLimit).toBe(500);
  });

  it("throws not_found when getting a thread that is not accessible", async () => {
    const { getChatThreadById } = await loadChatDal();

    const row: ThreadRow = {
      createdAt: new Date(0),
      endedAt: null,
      id: "thread_1",
      lastActivityAt: new Date(0),
      mode: "chat-assistant",
      projectId: "proj_1",
      status: "running",
      title: "Test",
      updatedAt: new Date(0),
      workflowRunId: "run_1",
    };
    state.threadsById.set(row.id, row);
    state.threadFindFirstQueue.push(row);
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    await expect(getChatThreadById("thread_1", "user_1")).rejects.toMatchObject(
      {
        code: "not_found",
        status: 404,
      } satisfies Partial<AppError>,
    );
  });

  it("updates only provided fields when updating by workflow run id", async () => {
    const { updateChatThreadByWorkflowRunId } = await loadChatDal();

    await updateChatThreadByWorkflowRunId("run_1", { title: "New title" });
    expect(state.lastUpdateSetValues).toMatchObject({ title: "New title" });
    expect(state.lastUpdateSetValues).not.toHaveProperty("status");
    expect(state.lastUpdateSetValues).not.toHaveProperty("endedAt");

    await updateChatThreadByWorkflowRunId("run_1", { endedAt: null });
    expect(state.lastUpdateSetValues).toMatchObject({ endedAt: null });
  });
});
