import { beforeEach, describe, expect, it, vi } from "vitest";

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
  messages: [] as MessageRow[],
  nextMessageId: 1,
  nextThreadId: 1,
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
        findMany: async (_opts: unknown) =>
          state.messages
            .slice()
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      },
      chatThreadsTable: {
        findFirst: async (_opts: unknown) => {
          const first = state.threadsById.values().next().value;
          return first ?? null;
        },
        findMany: async (_opts: unknown) =>
          Array.from(state.threadsById.values()),
      },
    },
    update: (_table: unknown) => ({
      set: (_values: unknown) => ({
        where: async (_where: unknown) => {},
      }),
    }),
  };
}

vi.mock("@/db/client", () => ({
  getDb: () => createFakeDb(),
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: async (projectId: string) => ({ id: projectId }),
}));

async function loadChatDal() {
  vi.resetModules();
  return await import("@/lib/data/chat.server");
}

beforeEach(() => {
  state.messages = [];
  state.nextMessageId = 1;
  state.nextThreadId = 1;
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
});
