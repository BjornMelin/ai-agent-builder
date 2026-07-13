import type { ModelMessage, UIMessage, UIMessageChunk } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

type AgentStreamInput = Readonly<{ messages: ModelMessage[] }> &
  Record<string, unknown>;

const state = vi.hoisted(() => ({
  acceptChatFollowUpStep: vi.fn(),
  agentConstructors: [] as unknown[],
  agentStream: vi.fn(),
  agentStreamInputs: [] as ModelMessage[][],
  buildAssistantTurnMessageStep: vi.fn(),
  buildChatToolsContext: vi.fn(),
  buildChatToolsForMode: vi.fn(),
  chatMessageHook: { create: vi.fn() },
  collectBufferedToolResults: vi.fn(),
  convertToModelMessages: vi.fn(),
  getChatModelById: vi.fn(),
  getEnabledAgentMode: vi.fn(),
  getWorkflowMetadata: vi.fn(),
  getWritable: vi.fn(),
  hookGetConflict: vi.fn(),
  isWorkflowRunCancelledError: vi.fn(),
  listProjectSkillsStep: vi.fn(),
  persistChatMessagesForWorkflowRun: vi.fn(),
  publishAssistantTurnStep: vi.fn(),
  registerChatWorkflowStep: vi.fn(),
  transitionChatThreadStateStep: vi.fn(),
  writeChatFollowUpDisposition: vi.fn(),
  writeChatSessionStatus: vi.fn(),
  writeChatTerminalAndClose: vi.fn(),
  writeStreamClose: vi.fn(),
  writeUserMessageMarker: vi.fn(),
}));

vi.mock("@ai-sdk/workflow", () => ({
  WorkflowAgent: class WorkflowAgentMock {
    public constructor(settings: unknown) {
      state.agentConstructors.push(settings);
    }

    public stream(input: AgentStreamInput) {
      state.agentStreamInputs.push([...input.messages]);
      return state.agentStream(input);
    }
  },
}));

vi.mock("ai", () => ({
  convertToModelMessages: (...args: unknown[]) =>
    state.convertToModelMessages(...args),
  isStepCount: (count: number) => ({ count }),
}));

vi.mock("workflow", () => ({
  getWorkflowMetadata: () => state.getWorkflowMetadata(),
  getWritable: (...args: unknown[]) => state.getWritable(...args),
}));

vi.mock("@/lib/ai/agents/registry.server", () => ({
  getEnabledAgentMode: (...args: unknown[]) =>
    state.getEnabledAgentMode(...args),
}));

vi.mock("@/lib/ai/gateway.server", () => ({
  getChatModelById: (...args: unknown[]) => state.getChatModelById(...args),
}));

vi.mock("@/lib/ai/tools/factory.server", () => ({
  buildChatToolsContext: (...args: unknown[]) =>
    state.buildChatToolsContext(...args),
  buildChatToolsForMode: (...args: unknown[]) =>
    state.buildChatToolsForMode(...args),
}));

vi.mock("@/workflows/chat/hooks/chat-message", () => ({
  chatMessageHook: state.chatMessageHook,
}));

vi.mock("@/workflows/chat/steps/assistant-turn-stream.step", () => ({
  buildAssistantTurnMessageStep: (...args: unknown[]) =>
    state.buildAssistantTurnMessageStep(...args),
  collectBufferedToolResults: (...args: unknown[]) =>
    state.collectBufferedToolResults(...args),
  publishAssistantTurnStep: (...args: unknown[]) =>
    state.publishAssistantTurnStep(...args),
}));

vi.mock("@/workflows/chat/steps/chat-follow-up.step", () => ({
  acceptChatFollowUpStep: (...args: unknown[]) =>
    state.acceptChatFollowUpStep(...args),
}));

vi.mock("@/workflows/chat/steps/chat-messages.step", () => ({
  persistChatMessagesForWorkflowRun: (...args: unknown[]) =>
    state.persistChatMessagesForWorkflowRun(...args),
}));

vi.mock("@/workflows/chat/steps/chat-thread-state.step", () => ({
  registerChatWorkflowStep: (...args: unknown[]) =>
    state.registerChatWorkflowStep(...args),
  transitionChatThreadStateStep: (...args: unknown[]) =>
    state.transitionChatThreadStateStep(...args),
}));

vi.mock("@/workflows/chat/steps/writer.step", () => ({
  writeChatFollowUpDisposition: (...args: unknown[]) =>
    state.writeChatFollowUpDisposition(...args),
  writeChatSessionStatus: (...args: unknown[]) =>
    state.writeChatSessionStatus(...args),
  writeChatTerminalAndClose: (...args: unknown[]) =>
    state.writeChatTerminalAndClose(...args),
  writeStreamClose: (...args: unknown[]) => state.writeStreamClose(...args),
  writeUserMessageMarker: (...args: unknown[]) =>
    state.writeUserMessageMarker(...args),
}));

vi.mock("@/workflows/chat/steps/skills.step", () => ({
  listProjectSkillsStep: (...args: unknown[]) =>
    state.listProjectSkillsStep(...args),
}));

vi.mock("@/workflows/runs/workflow-errors", () => ({
  isWorkflowRunCancelledError: (...args: unknown[]) =>
    state.isWorkflowRunCancelledError(...args),
}));

const initialMessage: UIMessage = {
  id: "u1",
  parts: [{ text: "hi", type: "text" }],
  role: "user",
};

function setHookDeliveries(deliveries: readonly unknown[]) {
  let index = 0;
  state.chatMessageHook.create.mockReturnValue({
    getConflict: state.hookGetConflict,
    // biome-ignore lint/suspicious/noThenProperty: Workflow hooks are reusable thenables.
    then: (resolve: (value: unknown) => void) => {
      const delivery = deliveries[index];
      index += 1;
      if (delivery === undefined) {
        throw new Error("Test hook delivery exhausted.");
      }
      resolve(delivery);
    },
  });
}

async function loadWorkflow() {
  vi.resetModules();
  return await import("@/workflows/chat/project-chat.workflow");
}

beforeEach(() => {
  vi.clearAllMocks();
  state.agentConstructors = [];
  state.agentStreamInputs = [];
  state.hookGetConflict.mockResolvedValue(null);
  state.registerChatWorkflowStep.mockResolvedValue(true);
  state.getWorkflowMetadata.mockReturnValue({ workflowRunId: "run_1" });
  state.getWritable.mockImplementation(
    () => new WritableStream<UIMessageChunk>({ write() {} }),
  );
  state.getEnabledAgentMode.mockReturnValue({
    allowedTools: ["retrieveProjectChunks"],
    budgets: { maxStepsPerTurn: 2 },
    defaultModel: "openai/gpt-4o",
    modeId: "chat-assistant",
    systemPrompt: "system",
  });
  state.buildChatToolsForMode.mockReturnValue({});
  state.buildChatToolsContext.mockReturnValue({});
  state.getChatModelById.mockReturnValue({ kind: "model" });
  state.isWorkflowRunCancelledError.mockReturnValue(false);
  state.listProjectSkillsStep.mockResolvedValue([]);
  state.convertToModelMessages.mockImplementation(
    async (messages: UIMessage[]) =>
      messages.map(
        (message) =>
          ({
            content: message.parts
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join(""),
            role: message.role,
          }) as ModelMessage,
      ),
  );
  state.agentStream.mockImplementation(async (input: AgentStreamInput) => ({
    messages: [
      { content: "system", role: "system" } as ModelMessage,
      ...input.messages,
      { content: "assistant", role: "assistant" } as ModelMessage,
    ],
    steps: [{ reasoningText: undefined, text: "assistant", toolCalls: [] }],
  }));
  state.buildAssistantTurnMessageStep.mockImplementation(
    async ({ assistantMessageId }: { assistantMessageId: string }) => ({
      id: assistantMessageId,
      parts: [{ text: assistantMessageId, type: "text" }],
      role: "assistant",
    }),
  );
  state.collectBufferedToolResults.mockReturnValue([]);
  state.acceptChatFollowUpStep.mockImplementation(
    async ({ payload }: { payload: { message?: string } }) => ({
      kind: payload.message === "/done" ? "command" : "user",
      status: "accepted",
    }),
  );
  state.transitionChatThreadStateStep.mockImplementation(
    async ({ status }: { status: string }) => ({
      changed: true,
      id: "thread_1",
      status,
      updatedAt: new Date("2026-07-13T00:00:00.000Z"),
    }),
  );
  setHookDeliveries([
    {
      message: "follow up",
      messageId: "follow_1",
      waitingSince: "2026-07-13T00:00:00.000Z",
    },
    {
      message: "/done",
      messageId: "done_1",
      waitingSince: "2026-07-13T00:01:00.000Z",
    },
  ]);
});

describe("projectChat workflow", () => {
  it("rejects a non-user initial message before claiming the thread", async () => {
    const { projectChat } = await loadWorkflow();

    await expect(
      projectChat(
        "proj_1",
        { ...initialMessage, role: "assistant" },
        "chat-assistant",
        "thread_1",
      ),
    ).rejects.toThrow(
      "Project chat requires one meaningful text/file user message.",
    );

    expect(state.registerChatWorkflowStep).not.toHaveBeenCalled();
    expect(state.persistChatMessagesForWorkflowRun).not.toHaveBeenCalled();
  });

  it("persists accepted hook payloads before markers/model work and finalizes authoritatively", async () => {
    const { projectChat } = await loadWorkflow();

    const result = await projectChat(
      "proj_1",
      initialMessage,
      "chat-assistant",
      "thread_1",
    );

    expect(result.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(state.agentStream).toHaveBeenCalledTimes(2);
    expect(state.persistChatMessagesForWorkflowRun).toHaveBeenNthCalledWith(1, {
      messages: [initialMessage],
      workflowRunId: "run_1",
    });
    expect(state.writeUserMessageMarker).toHaveBeenNthCalledWith(
      1,
      expect.any(WritableStream),
      { content: "hi", messageId: "u1" },
    );
    expect(state.hookGetConflict).toHaveBeenCalledTimes(1);
    expect(state.acceptChatFollowUpStep).toHaveBeenCalledTimes(2);
    expect(
      state.acceptChatFollowUpStep.mock.invocationCallOrder[0],
    ).toBeLessThan(
      state.writeUserMessageMarker.mock.invocationCallOrder[1] ?? 0,
    );
    expect(
      state.writeChatSessionStatus.mock.calls.map((call) => call[1]),
    ).toEqual(["waiting", "running", "waiting"]);
    expect(
      state.writeUserMessageMarker.mock.calls.some(
        (call) => (call[1] as { messageId?: string }).messageId === "done_1",
      ),
    ).toBe(false);
    expect(state.writeChatTerminalAndClose).toHaveBeenCalledWith(
      expect.any(WritableStream),
      "succeeded",
      undefined,
    );
    expect(
      state.transitionChatThreadStateStep.mock.invocationCallOrder.at(-1),
    ).toBeLessThan(
      state.writeChatTerminalAndClose.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
  });

  it("skips duplicate durable deliveries without a second marker or model turn", async () => {
    setHookDeliveries([
      {
        message: "follow up",
        messageId: "follow_1",
        waitingSince: "2026-07-13T00:00:00.000Z",
      },
      {
        message: "follow up",
        messageId: "follow_1",
        waitingSince: "2026-07-13T00:00:00.000Z",
      },
      {
        message: "/done",
        messageId: "done_1",
        waitingSince: "2026-07-13T00:01:00.000Z",
      },
    ]);
    state.acceptChatFollowUpStep
      .mockResolvedValueOnce({ kind: "user", status: "accepted" })
      .mockResolvedValueOnce({ status: "already_committed" })
      .mockResolvedValueOnce({ kind: "command", status: "accepted" });
    const { projectChat } = await loadWorkflow();

    await projectChat("proj_1", initialMessage, "chat-assistant", "thread_1");

    expect(state.agentStream).toHaveBeenCalledTimes(2);
    expect(state.acceptChatFollowUpStep).toHaveBeenCalledTimes(3);
    expect(
      state.writeUserMessageMarker.mock.calls.filter(
        (call) => (call[1] as { messageId?: string }).messageId === "follow_1",
      ),
    ).toHaveLength(1);
    expect(state.writeChatFollowUpDisposition).toHaveBeenCalledWith(
      expect.any(WritableStream),
      {
        messageId: "follow_1",
        outcome: "duplicate",
        reason: "already_committed",
      },
    );
  });

  it("continues side effects when a committed acceptance step replays after process death", async () => {
    state.acceptChatFollowUpStep
      .mockResolvedValueOnce({ kind: "user", status: "resume_committed" })
      .mockResolvedValueOnce({ kind: "command", status: "accepted" });
    const { projectChat } = await loadWorkflow();

    await projectChat("proj_1", initialMessage, "chat-assistant", "thread_1");

    expect(state.agentStream).toHaveBeenCalledTimes(2);
    expect(
      state.writeUserMessageMarker.mock.calls.filter(
        (call) => (call[1] as { messageId?: string }).messageId === "follow_1",
      ),
    ).toHaveLength(1);
  });

  it("skips mismatched same-ID delivery without transcript or model side effects", async () => {
    setHookDeliveries([
      {
        message: "tampered",
        messageId: "existing_1",
        waitingSince: "2026-07-13T00:00:00.000Z",
      },
      {
        message: "/done",
        messageId: "done_1",
        waitingSince: "2026-07-13T00:00:00.000Z",
      },
    ]);
    state.acceptChatFollowUpStep
      .mockResolvedValueOnce({ status: "payload_mismatch" })
      .mockResolvedValueOnce({ kind: "command", status: "accepted" });
    const { projectChat } = await loadWorkflow();

    await projectChat("proj_1", initialMessage, "chat-assistant", "thread_1");

    expect(state.agentStream).toHaveBeenCalledTimes(1);
    expect(
      state.writeUserMessageMarker.mock.calls.some(
        (call) =>
          (call[1] as { messageId?: string }).messageId === "existing_1",
      ),
    ).toBe(false);
    expect(state.writeChatFollowUpDisposition).toHaveBeenCalledWith(
      expect.any(WritableStream),
      {
        messageId: "existing_1",
        outcome: "rejected",
        reason: "payload_mismatch",
      },
    );
  });

  it("emits no terminal marker when terminal persistence fails", async () => {
    const persistenceError = new Error("terminal write failed");
    state.transitionChatThreadStateStep.mockImplementation(
      async ({ status }: { status: string }) => {
        if (status === "succeeded") throw persistenceError;
        return {
          changed: true,
          id: "thread_1",
          status,
          updatedAt: new Date(),
        };
      },
    );
    setHookDeliveries([
      {
        message: "/done",
        messageId: "done_1",
        waitingSince: "2026-07-13T00:00:00.000Z",
      },
    ]);
    const { projectChat } = await loadWorkflow();

    await expect(
      projectChat("proj_1", initialMessage, "chat-assistant", "thread_1"),
    ).rejects.toBe(persistenceError);

    expect(state.writeChatTerminalAndClose).not.toHaveBeenCalled();
    expect(state.writeStreamClose).toHaveBeenCalledWith(
      expect.any(WritableStream),
      "Chat session finalization failed.",
    );
  });

  it("emits the terminal state that won a cancellation/finalization race", async () => {
    state.transitionChatThreadStateStep.mockImplementation(
      async ({ status }: { status: string }) => ({
        changed: status !== "succeeded",
        id: "thread_1",
        status: status === "succeeded" ? "canceled" : status,
        updatedAt: new Date(),
      }),
    );
    setHookDeliveries([
      {
        message: "/done",
        messageId: "done_1",
        waitingSince: "2026-07-13T00:00:00.000Z",
      },
    ]);
    const { projectChat } = await loadWorkflow();

    await projectChat("proj_1", initialMessage, "chat-assistant", "thread_1");

    expect(state.writeChatTerminalAndClose).toHaveBeenCalledWith(
      expect.any(WritableStream),
      "canceled",
      undefined,
    );
  });

  it("publishes nothing and persists failed when buffered model production fails", async () => {
    const agentError = new Error("agent failed");
    state.agentStream.mockRejectedValueOnce(agentError);
    const { projectChat } = await loadWorkflow();

    await expect(
      projectChat("proj_1", initialMessage, "chat-assistant", "thread_1"),
    ).rejects.toBe(agentError);

    expect(state.buildAssistantTurnMessageStep).not.toHaveBeenCalled();
    expect(state.publishAssistantTurnStep).not.toHaveBeenCalled();
    expect(state.writeChatTerminalAndClose).toHaveBeenCalledWith(
      expect.any(WritableStream),
      "failed",
      "Chat session failed.",
    );
  });

  it("buffers model output, persists it, then publishes without a producer writable", async () => {
    setHookDeliveries([
      {
        message: "/done",
        messageId: "done_1",
        waitingSince: "2026-07-13T00:00:00.000Z",
      },
    ]);
    const { projectChat } = await loadWorkflow();

    await projectChat("proj_1", initialMessage, "chat-assistant", "thread_1");

    const streamInput = state.agentStream.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(streamInput).not.toHaveProperty("writable");
    expect(state.getWritable).toHaveBeenCalledTimes(1);
    expect(state.getWritable).toHaveBeenCalledWith();
    expect(
      state.persistChatMessagesForWorkflowRun.mock.invocationCallOrder[1],
    ).toBeLessThan(
      state.publishAssistantTurnStep.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
  });

  it("exits a duplicate workflow envelope before any side effect", async () => {
    state.registerChatWorkflowStep.mockResolvedValueOnce(false);
    const { projectChat } = await loadWorkflow();

    await expect(
      projectChat("proj_1", initialMessage, "chat-assistant", "thread_1"),
    ).resolves.toEqual({ messages: [] });

    expect(state.registerChatWorkflowStep).toHaveBeenCalledWith(
      "thread_1",
      "run_1",
    );
    expect(state.persistChatMessagesForWorkflowRun).not.toHaveBeenCalled();
    expect(state.getWritable).not.toHaveBeenCalled();
    expect(state.agentStream).not.toHaveBeenCalled();
  });
});
