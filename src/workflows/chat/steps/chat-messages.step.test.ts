import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  appendChatMessages: vi.fn(),
  findFirst: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: () => state.getDb(),
}));

vi.mock("@/lib/data/chat.server", () => ({
  appendChatMessages: state.appendChatMessages,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.findFirst.mockResolvedValue({ id: "thread_1" });
  state.getDb.mockReturnValue({
    query: {
      chatThreadsTable: {
        findFirst: state.findFirst,
      },
    },
  });
});

describe("persistChatMessagesForWorkflowRun", () => {
  it("no-ops when messages is empty", async () => {
    const { persistChatMessagesForWorkflowRun } = await import(
      "@/workflows/chat/steps/chat-messages.step"
    );

    await persistChatMessagesForWorkflowRun({
      messages: [],
      workflowRunId: "run_1",
    });

    expect(state.findFirst).not.toHaveBeenCalled();
    expect(state.appendChatMessages).not.toHaveBeenCalled();
  });

  it("throws not_found when chat thread cannot be found", async () => {
    state.findFirst.mockResolvedValueOnce(null);

    const { persistChatMessagesForWorkflowRun } = await import(
      "@/workflows/chat/steps/chat-messages.step"
    );

    await expect(
      persistChatMessagesForWorkflowRun({
        messages: [
          { id: "m1", parts: [{ text: "hi", type: "text" }], role: "user" },
        ],
        workflowRunId: "run_1",
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<AppError>);
  });

  it("persists messages by appending to the resolved thread id", async () => {
    const { persistChatMessagesForWorkflowRun } = await import(
      "@/workflows/chat/steps/chat-messages.step"
    );

    await persistChatMessagesForWorkflowRun({
      messages: [
        { id: "m1", parts: [{ text: "hi", type: "text" }], role: "user" },
      ],
      workflowRunId: "run_1",
    });

    expect(state.appendChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "thread_1" }),
    );
  });

  it("wraps undefined-table errors into db_not_migrated", async () => {
    state.findFirst.mockRejectedValueOnce(
      Object.assign(new Error("missing table"), { code: "42P01" }),
    );

    const { persistChatMessagesForWorkflowRun } = await import(
      "@/workflows/chat/steps/chat-messages.step"
    );

    await expect(
      persistChatMessagesForWorkflowRun({
        messages: [
          { id: "m1", parts: [{ text: "hi", type: "text" }], role: "user" },
        ],
        workflowRunId: "run_1",
      }),
    ).rejects.toMatchObject({
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });
});
