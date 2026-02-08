import type { ModelMessage, UIMessage, UIMessageChunk } from "ai";
import { mockValues } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  buildChatToolsForMode: vi.fn(),
  chatMessageHook: {
    create: vi.fn(),
  },
  convertToModelMessages: vi.fn(),
  DurableAgent: vi.fn(),
  getEnabledAgentMode: vi.fn(),
  getWorkflowChatModel: vi.fn(),
  getWorkflowMetadata: vi.fn(),
  getWritable: vi.fn(),
  isWorkflowRunCancelledError: vi.fn(),
  persistChatMessagesForWorkflowRun: vi.fn(),
  touchChatThreadState: vi.fn(),
  writeStreamClose: vi.fn(),
  writeUserMessageMarker: vi.fn(),
}));

vi.mock("@workflow/ai/agent", () => ({
  DurableAgent: class DurableAgentMock {
    public stream = async (input: {
      messages: ModelMessage[];
    }): Promise<{
      messages: ModelMessage[];
      uiMessages?: UIMessage[];
    }> => {
      const next: ModelMessage = { content: "assistant", role: "assistant" };
      const uiMessages: UIMessage[] = [
        {
          id: "ui_1",
          parts: [{ text: "assistant", type: "text" }],
          role: "assistant",
        },
      ];
      return { messages: [...input.messages, next], uiMessages };
    };
  },
}));

vi.mock("ai", () => ({
  convertToModelMessages: (...args: unknown[]) =>
    state.convertToModelMessages(...args),
}));

vi.mock("workflow", () => ({
  getWorkflowMetadata: () => state.getWorkflowMetadata(),
  getWritable: () => state.getWritable(),
}));

vi.mock("@/lib/ai/agents/registry.server", () => ({
  getEnabledAgentMode: (...args: unknown[]) =>
    state.getEnabledAgentMode(...args),
}));

vi.mock("@/lib/ai/tools/factory.server", () => ({
  buildChatToolsForMode: (...args: unknown[]) =>
    state.buildChatToolsForMode(...args),
}));

vi.mock("@/workflows/ai/gateway-models.step", () => ({
  getWorkflowChatModel: (...args: unknown[]) =>
    state.getWorkflowChatModel(...args),
}));

vi.mock("@/workflows/chat/hooks/chat-message", () => ({
  chatMessageHook: state.chatMessageHook,
}));

vi.mock("@/workflows/chat/steps/chat-messages.step", () => ({
  persistChatMessagesForWorkflowRun: (...args: unknown[]) =>
    state.persistChatMessagesForWorkflowRun(...args),
}));

vi.mock("@/workflows/chat/steps/chat-thread-state.step", () => ({
  touchChatThreadState: (...args: unknown[]) =>
    state.touchChatThreadState(...args),
}));

vi.mock("@/workflows/chat/steps/writer.step", () => ({
  writeStreamClose: (...args: unknown[]) => state.writeStreamClose(...args),
  writeUserMessageMarker: (...args: unknown[]) =>
    state.writeUserMessageMarker(...args),
}));

vi.mock("@/workflows/runs/workflow-errors", () => ({
  isWorkflowRunCancelledError: (...args: unknown[]) =>
    state.isWorkflowRunCancelledError(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.getWorkflowMetadata.mockReturnValue({ workflowRunId: "run_1" });
  state.getWritable.mockReturnValue(
    new WritableStream<UIMessageChunk>({
      write() {},
    }),
  );
  state.getEnabledAgentMode.mockReturnValue({
    allowedTools: ["retrieveProjectChunks"],
    budgets: { maxStepsPerTurn: 2 },
    defaultModel: "openai/gpt-4o",
    displayName: "Chat",
    modeId: "chat-assistant",
    requirements: { context7: false, webResearch: false },
    systemPrompt: "system",
  });
  state.buildChatToolsForMode.mockReturnValue({});
  state.getWorkflowChatModel.mockResolvedValue({ kind: "model" });
  state.isWorkflowRunCancelledError.mockReturnValue(false);
  state.convertToModelMessages.mockResolvedValue([
    { content: "initial", role: "user" } satisfies ModelMessage,
  ]);

  // Thenable hook that yields one follow-up, then /done.
  state.chatMessageHook.create.mockImplementation(() => {
    const next = mockValues(
      { message: "follow up", messageId: "m_follow" },
      { message: "/done", messageId: "m_done" },
    );
    return {
      // biome-ignore lint/suspicious/noThenProperty: Awaiting the hook requires a thenable value.
      then: (resolve: (value: unknown) => void) => {
        resolve(next());
      },
    };
  });
});

describe("projectChat workflow", () => {
  it("streams agent turns, persists UI messages, and finalizes the stream", async () => {
    const { projectChat } = await import(
      "@/workflows/chat/project-chat.workflow"
    );

    const initialMessages: UIMessage[] = [
      { id: "u1", parts: [{ text: "hi", type: "text" }], role: "user" },
    ];

    const res = await projectChat(
      "proj_1",
      initialMessages,
      "Thread",
      "chat-assistant",
    );

    expect(res.messages.some((m) => m.role === "assistant")).toBe(true);
    expect(state.touchChatThreadState).toHaveBeenCalled();
    expect(state.persistChatMessagesForWorkflowRun).toHaveBeenCalled();
    expect(state.writeUserMessageMarker).toHaveBeenCalled();
    expect(state.writeStreamClose).toHaveBeenCalled();

    // Finalization should record a terminal status for the thread state.
    const calls = state.touchChatThreadState.mock.calls.flat();
    expect(calls.some((c) => typeof c === "object" && c && "status" in c)).toBe(
      true,
    );
  });
});
