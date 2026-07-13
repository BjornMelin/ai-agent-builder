// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectChatClient } from "./chat-client";

const state = vi.hoisted(() => ({
  reconnectToStream: vi.fn(),
  sendMessage: vi.fn(),
  sendMessages: vi.fn(),
  setMessages: vi.fn(),
  stop: vi.fn(),
  transportConstructor: vi.fn(),
  useChat: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: state.useChat,
}));

vi.mock("@ai-sdk/workflow", () => ({
  WorkflowChatTransport: class WorkflowChatTransport {
    public constructor(options: unknown) {
      state.transportConstructor(options);
    }

    public reconnectToStream(options: unknown) {
      return state.reconnectToStream(options);
    }

    public sendMessages(options: unknown) {
      return state.sendMessages(options);
    }
  },
}));

const originalFetch = globalThis.fetch;

type MountedClient = Readonly<{
  container: HTMLDivElement;
  root: Root;
}>;

type ThreadFixture = Readonly<{
  createdAt: string;
  endedAt: string | null;
  id: string;
  lastActivityAt: string;
  mode: string;
  projectId: string;
  status:
    | "canceled"
    | "failed"
    | "pending"
    | "running"
    | "succeeded"
    | "waiting";
  title: string;
  updatedAt: string;
  workflowRunId: string | null;
}>;

const activeThread: ThreadFixture = {
  createdAt: "2026-07-13T00:00:00.000Z",
  endedAt: null,
  id: "thread_1",
  lastActivityAt: "2026-07-13T00:00:00.000Z",
  mode: "architect",
  projectId: "proj_1",
  status: "running",
  title: "Active chat",
  updatedAt: "2026-07-13T00:00:00.000Z",
  workflowRunId: "run_1",
};

const completedThread: ThreadFixture = {
  ...activeThread,
  endedAt: "2026-07-13T00:05:00.000Z",
  id: "thread_old",
  status: "succeeded",
  title: "Historical chat",
  workflowRunId: "run_old",
};

const pendingThread: ThreadFixture = {
  ...activeThread,
  id: "00000000-0000-4000-8000-000000000001",
  status: "pending",
  title: "Recover me",
  workflowRunId: null,
};

type TransportOptions = Readonly<{
  api: string;
  onChatEnd: () => void | Promise<void>;
  onChatSendMessage: (
    response: Response,
    options: {
      messages: Array<{ id: string; parts: unknown[]; role: string }>;
    },
  ) => void | Promise<void>;
  prepareSendMessagesRequest: (options: {
    messages: Array<{ id: string; parts: unknown[]; role: string }>;
  }) => Promise<{ body: Record<string, unknown> }>;
}>;

type UseChatOptions = Readonly<{
  onData: (part: Readonly<{ data: unknown; type: string }>) => void;
  onError: (error: Error) => void;
  resume: boolean;
  transport: {
    reconnectToStream(options: unknown): unknown;
  };
}>;

function getTransportOptions(): TransportOptions {
  const options = state.transportConstructor.mock.calls[0]?.[0];
  expect(options).toBeDefined();
  return options as TransportOptions;
}

function getUseChatOptions(): UseChatOptions {
  const options = state.useChat.mock.calls[0]?.[0];
  expect(options).toBeDefined();
  return options as UseChatOptions;
}

function getButtonByText(
  container: HTMLElement,
  text: string,
): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  expect(button).toBeInstanceOf(HTMLButtonElement);
  return button as HTMLButtonElement;
}

function getComposer(container: HTMLElement): HTMLTextAreaElement {
  const textarea = container.querySelector<HTMLTextAreaElement>(
    'textarea[name="message"]',
  );
  expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
  return textarea as HTMLTextAreaElement;
}

function submitComposer(textarea: HTMLTextAreaElement, text: string): void {
  textarea.value = text;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.form?.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function mountClient(
  options: Readonly<{
    initialMessages?: readonly {
      id: string;
      parts: unknown[];
      role: "assistant" | "system" | "user";
    }[];
    initialThread?: ThreadFixture | null;
    threads?: readonly ThreadFixture[];
  }> = {},
): Promise<MountedClient> {
  const initialThread =
    options.initialThread === undefined ? activeThread : options.initialThread;
  const threads = options.threads ?? (initialThread ? [initialThread] : []);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ProjectChatClient
        defaultModeId="architect"
        enabledModes={[
          {
            description: "Plans changes.",
            displayName: "Architect",
            modeId: "architect",
          },
        ]}
        initialMessages={options.initialMessages ?? []}
        initialThread={initialThread}
        maxAttachmentBytes={25_000_000}
        projectId="proj_1"
        threads={threads}
      />,
    );
    await flushMicrotasks();
  });

  return { container, root };
}

async function unmountClient(mounted: MountedClient): Promise<void> {
  await act(async () => {
    mounted.root.unmount();
  });
  mounted.container.remove();
}

describe("ProjectChatClient lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/projects/proj_1/chat");
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.ResizeObserver = class ResizeObserver {
      public disconnect() {}
      public observe() {}
      public unobserve() {}
    };
    state.reconnectToStream.mockResolvedValue(null);
    state.sendMessage.mockResolvedValue(undefined);
    state.sendMessages.mockResolvedValue(new ReadableStream());
    state.useChat.mockReturnValue({
      messages: [],
      sendMessage: state.sendMessage,
      setMessages: state.setMessages,
      status: "streaming",
      stop: state.stop,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = "";
  });

  it("stops the active useChat request after cancellation succeeds", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, status: "canceled" }, { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const mounted = await mountClient();
    const stopButton = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Stop"]',
    );

    expect(stopButton).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      stopButton?.click();
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/chat/run_1/cancel", {
      method: "POST",
    });
    expect(state.stop).toHaveBeenCalledTimes(1);

    await unmountClient(mounted);
  });

  it("uses the native transport reconnect behavior without a route override", async () => {
    const mounted = await mountClient();
    const constructorOptions = getTransportOptions();

    expect(constructorOptions).toMatchObject({ api: "/api/chat" });
    expect(constructorOptions).not.toHaveProperty(
      "prepareReconnectToStreamRequest",
    );

    const useChatOptions = getUseChatOptions();
    const reconnectOptions = { chatId: "run_1" };
    await useChatOptions.transport.reconnectToStream(reconnectOptions);

    expect(useChatOptions.resume).toBe(true);
    expect(state.reconnectToStream).toHaveBeenCalledWith(reconnectOptions);

    await unmountClient(mounted);
  });

  it("uses durable session-status markers to switch between Stop and Submit", async () => {
    const mounted = await mountClient();
    const useChatOptions = getUseChatOptions();

    expect(
      mounted.container.querySelector('button[aria-label="Stop"]'),
    ).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          status: "waiting",
          timestamp: 1,
          type: "session-status",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    expect(
      mounted.container.querySelector('button[aria-label="Submit"]'),
    ).toBeInstanceOf(HTMLButtonElement);
    expect(
      mounted.container.querySelector('button[aria-label="Stop"]'),
    ).toBeNull();

    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          status: "running",
          timestamp: 2,
          type: "session-status",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    expect(
      mounted.container.querySelector('button[aria-label="Stop"]'),
    ).toBeInstanceOf(HTMLButtonElement);

    await unmountClient(mounted);
  });

  it("keeps an active server run locked after a transport error", async () => {
    const mounted = await mountClient();
    const useChatOptions = getUseChatOptions();

    await act(async () => {
      useChatOptions.onError(new Error("Failed to reconnect after 3 errors."));
      await flushMicrotasks();
    });

    expect(mounted.container.textContent).toContain("Active chat · running");
    expect(mounted.container.textContent).toContain("Run: run_1");
    expect(mounted.container.textContent).toContain(
      "Connection interrupted. Reload to reconcile this chat session.",
    );
    expect(getButtonByText(mounted.container, "New Chat").disabled).toBe(true);
    expect(
      mounted.container.querySelector('button[aria-label="Stop"]'),
    ).toBeInstanceOf(HTMLButtonElement);

    await unmountClient(mounted);
  });

  it("unlocks /done for stable retry after a transport error", async () => {
    globalThis.fetch = vi.fn(async (_input, init) =>
      init?.method === "POST"
        ? Response.json({ ok: true, status: "queued" }, { status: 202 })
        : Response.json({ status: "running" }),
    ) as unknown as typeof fetch;
    const mounted = await mountClient();
    const useChatOptions = getUseChatOptions();

    await act(async () => {
      getButtonByText(mounted.container, "End Session").click();
      await flushMicrotasks();
    });
    expect(getButtonByText(mounted.container, "Ending…").disabled).toBe(true);

    await act(async () => {
      useChatOptions.onError(new Error("stream interrupted"));
      await flushMicrotasks();
    });

    expect(getButtonByText(mounted.container, "End Session").disabled).toBe(
      false,
    );
    expect(mounted.container.textContent).toContain(
      "Connection interrupted. Reload to reconcile this chat session.",
    );

    await unmountClient(mounted);
  });

  it("keeps /done locked through generic finish and unlocks on terminal marker", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ ok: true, status: "queued" }, { status: 202 }),
    ) as unknown as typeof fetch;
    const mounted = await mountClient();
    const transportOptions = getTransportOptions();
    const useChatOptions = getUseChatOptions();

    await act(async () => {
      getButtonByText(mounted.container, "End Session").click();
      await flushMicrotasks();
    });

    expect(getButtonByText(mounted.container, "Ending…").disabled).toBe(true);
    expect(getButtonByText(mounted.container, "New Chat").disabled).toBe(true);
    expect(mounted.container.textContent).toContain("Run: run_1");

    await act(async () => {
      await transportOptions.onChatEnd();
      await flushMicrotasks();
    });

    expect(mounted.container.textContent).toContain("Active chat · running");
    expect(mounted.container.textContent).toContain("Run: run_1");
    expect(mounted.container.textContent).toContain(
      "Chat stream ended before terminal status was confirmed.",
    );
    expect(getButtonByText(mounted.container, "New Chat").disabled).toBe(true);

    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          status: "succeeded",
          timestamp: 3,
          type: "terminal",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    expect(mounted.container.textContent).toContain("Active chat · succeeded");
    expect(mounted.container.textContent).not.toContain("Run: run_1");
    expect(getButtonByText(mounted.container, "New Chat").disabled).toBe(false);

    await unmountClient(mounted);
  });

  it("unlocks a rejected /done delivery and retries its stable message identity", async () => {
    const postedMessageIds: string[] = [];
    globalThis.fetch = vi.fn(async (_input, init) => {
      postedMessageIds.push(
        (JSON.parse(String(init?.body)) as { messageId: string }).messageId,
      );
      return Response.json({ ok: true, status: "queued" }, { status: 202 });
    }) as unknown as typeof fetch;
    const mounted = await mountClient();
    const useChatOptions = getUseChatOptions();

    await act(async () => {
      getButtonByText(mounted.container, "End Session").click();
      await vi.waitFor(() => expect(postedMessageIds).toHaveLength(1));
    });

    expect(getButtonByText(mounted.container, "Ending…").disabled).toBe(true);

    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          messageId: postedMessageIds[0],
          outcome: "rejected",
          reason: "not_waiting",
          timestamp: 2,
          type: "follow-up-disposition",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    expect(getButtonByText(mounted.container, "End Session").disabled).toBe(
      false,
    );
    expect(mounted.container.textContent).toContain(
      "The chat started another turn before this message was admitted.",
    );

    await act(async () => {
      getButtonByText(mounted.container, "End Session").click();
      await vi.waitFor(() => expect(postedMessageIds).toHaveLength(2));
    });

    expect(postedMessageIds[1]).toBe(postedMessageIds[0]);
    expect(getButtonByText(mounted.container, "Ending…").disabled).toBe(true);

    await unmountClient(mounted);
  });

  it("keeps a duplicate /done locked until authoritative terminal state", async () => {
    let messageId = "";
    globalThis.fetch = vi.fn(async (_input, init) => {
      messageId = (JSON.parse(String(init?.body)) as { messageId: string })
        .messageId;
      return Response.json({ ok: true, status: "queued" }, { status: 202 });
    }) as unknown as typeof fetch;
    const mounted = await mountClient();
    const useChatOptions = getUseChatOptions();

    await act(async () => {
      getButtonByText(mounted.container, "End Session").click();
      await vi.waitFor(() => expect(messageId).not.toBe(""));
      useChatOptions.onData({
        data: {
          domain: "chat",
          messageId,
          outcome: "duplicate",
          reason: "already_committed",
          timestamp: 2,
          type: "follow-up-disposition",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    expect(getButtonByText(mounted.container, "Ending…").disabled).toBe(true);
    expect(getButtonByText(mounted.container, "New Chat").disabled).toBe(true);

    await unmountClient(mounted);
  });

  it("does not turn a fast generic stream finish into false success", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        status: "running",
        threadId: "thread_2",
        workflowRunId: "run_2",
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    state.useChat.mockReturnValue({
      messages: [],
      sendMessage: state.sendMessage,
      setMessages: state.setMessages,
      status: "ready",
      stop: state.stop,
    });
    state.sendMessage.mockReturnValue(new Promise<void>(() => undefined));
    const mounted = await mountClient({
      initialThread: completedThread,
      threads: [completedThread],
    });
    await act(async () => {
      getButtonByText(mounted.container, "New Chat").click();
      await flushMicrotasks();
      submitComposer(getComposer(mounted.container), "Build it");
      await flushMicrotasks();
    });
    const pendingThreadId = new URL(window.location.href).searchParams.get(
      "threadId",
    );
    expect(pendingThreadId).toEqual(expect.any(String));
    const transportOptions = getTransportOptions();
    const useChatOptions = getUseChatOptions();
    const response = new Response(null, {
      headers: {
        "x-chat-thread-id": pendingThreadId ?? "",
        "x-workflow-run-id": "run_2",
      },
    });

    await act(async () => {
      await transportOptions.onChatSendMessage(response, {
        messages: [
          {
            id: `user:${pendingThreadId}:1`,
            parts: [{ text: "Build it", type: "text" }],
            role: "user",
          },
        ],
      });
      await transportOptions.onChatEnd();
      await flushMicrotasks();
    });

    expect(mounted.container.textContent).toContain("Build it · running");
    expect(mounted.container.textContent).toContain("Run: run_2");
    expect(getButtonByText(mounted.container, "New Chat").disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/chat/run_2", {
      headers: { Accept: "application/json" },
    });

    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          status: "succeeded",
          timestamp: 4,
          type: "terminal",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    expect(mounted.container.textContent).toContain("Build it · succeeded");
    expect(
      mounted.container.querySelector(
        'a[aria-label="Historical chat (succeeded)"]',
      ),
    ).toBeInstanceOf(HTMLAnchorElement);
    expect(
      mounted.container.querySelector('a[aria-label="Build it (succeeded)"]'),
    ).toBeInstanceOf(HTMLAnchorElement);

    await unmountClient(mounted);
  });

  it("reconciles a generic close to authenticated persisted cancellation", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        status: "canceled",
        threadId: "thread_1",
        workflowRunId: "run_1",
      }),
    ) as unknown as typeof fetch;
    const mounted = await mountClient();

    await act(async () => {
      await getTransportOptions().onChatEnd();
      await flushMicrotasks();
    });

    expect(mounted.container.textContent).toContain("Active chat · canceled");
    expect(mounted.container.textContent).not.toContain("Run: run_1");
    expect(mounted.container.textContent).not.toContain(
      "terminal status was confirmed",
    );

    await unmountClient(mounted);
  });

  it("clears an accepted initial draft before its durable stream ends", async () => {
    state.sendMessage.mockReturnValue(new Promise<void>(() => undefined));
    state.useChat.mockReturnValue({
      messages: [],
      sendMessage: state.sendMessage,
      setMessages: state.setMessages,
      status: "ready",
      stop: state.stop,
    });
    const mounted = await mountClient({ initialThread: null, threads: [] });
    const textarea = getComposer(mounted.container);

    await act(async () => {
      submitComposer(textarea, "Ship it");
      await flushMicrotasks();
    });

    expect(textarea.value).toBe("Ship it");
    const pendingThreadId = new URL(window.location.href).searchParams.get(
      "threadId",
    );
    expect(pendingThreadId).toEqual(expect.any(String));
    expect(state.sendMessage).toHaveBeenCalledWith({
      id: `user:${pendingThreadId}:1`,
      parts: [{ text: "Ship it", type: "text" }],
      role: "user",
    });
    await expect(
      getTransportOptions().prepareSendMessagesRequest({
        messages: [
          {
            id: `user:${pendingThreadId}:1`,
            parts: [{ text: "Ship it", type: "text" }],
            role: "user",
          },
        ],
      }),
    ).resolves.toMatchObject({
      body: {
        message: {
          id: `user:${pendingThreadId}:1`,
          parts: [{ text: "Ship it", type: "text" }],
          role: "user",
        },
        threadId: pendingThreadId,
      },
    });

    await act(async () => {
      await getTransportOptions().onChatSendMessage(
        new Response(null, {
          headers: {
            "x-chat-thread-id": pendingThreadId ?? "",
            "x-workflow-run-id": "run_2",
          },
        }),
        {
          messages: [
            {
              id: `user:${pendingThreadId}:1`,
              parts: [{ text: "Ship it", type: "text" }],
              role: "user",
            },
          ],
        },
      );
      await flushMicrotasks();
    });

    expect(textarea.value).toBe("");

    await unmountClient(mounted);
  });

  it("automatically retries a persisted pending start after a page reload", async () => {
    const initialMessage = {
      id: `user:${pendingThread.id}:1`,
      parts: [{ text: "Recover me", type: "text" }],
      role: "user" as const,
    };
    state.sendMessage.mockReturnValue(new Promise<void>(() => undefined));
    state.useChat.mockReturnValue({
      messages: [initialMessage],
      sendMessage: state.sendMessage,
      setMessages: state.setMessages,
      status: "ready",
      stop: state.stop,
    });

    const mounted = await mountClient({
      initialMessages: [initialMessage],
      initialThread: pendingThread,
      threads: [pendingThread],
    });

    expect(state.sendMessage).toHaveBeenCalledWith({
      messageId: initialMessage.id,
      parts: initialMessage.parts,
      role: "user",
    });
    await expect(
      getTransportOptions().prepareSendMessagesRequest({
        messages: [initialMessage],
      }),
    ).resolves.toMatchObject({
      body: { message: initialMessage, threadId: pendingThread.id },
    });

    await act(async () => {
      await getTransportOptions().onChatSendMessage(
        new Response(null, {
          headers: {
            "x-chat-thread-id": pendingThread.id,
            "x-workflow-run-id": "run_recovered",
          },
        }),
        { messages: [initialMessage] },
      );
      await flushMicrotasks();
    });

    expect(mounted.container.textContent).toContain("Run: run_recovered");
    await unmountClient(mounted);
  });

  it("does not recover a pending start with ambiguous user history", async () => {
    const firstMessage = {
      id: `user:${pendingThread.id}:1`,
      parts: [{ text: "First", type: "text" }],
      role: "user" as const,
    };
    const secondMessage = {
      id: `user:${pendingThread.id}:2`,
      parts: [{ text: "Second", type: "text" }],
      role: "user" as const,
    };
    state.useChat.mockReturnValue({
      messages: [secondMessage, firstMessage],
      sendMessage: state.sendMessage,
      setMessages: state.setMessages,
      status: "ready",
      stop: state.stop,
    });

    const mounted = await mountClient({
      initialMessages: [secondMessage, firstMessage],
      initialThread: pendingThread,
      threads: [pendingThread],
    });

    expect(state.sendMessage).not.toHaveBeenCalled();
    await expect(
      getTransportOptions().prepareSendMessagesRequest({
        messages: [secondMessage, firstMessage],
      }),
    ).rejects.toThrow("Chat start identity is missing.");

    await unmountClient(mounted);
  });

  it("retains a rejected follow-up draft", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json(
        { error: { code: "internal_error", message: "Follow-up rejected." } },
        { status: 500 },
      ),
    ) as unknown as typeof fetch;
    const mounted = await mountClient();
    const useChatOptions = getUseChatOptions();

    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          status: "waiting",
          timestamp: 1,
          type: "session-status",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    const textarea = getComposer(mounted.container);
    await act(async () => {
      submitComposer(textarea, "Please retry this");
      await flushMicrotasks();
    });

    expect(textarea.value).toBe("Please retry this");
    expect(mounted.container.textContent).toContain("Follow-up rejected.");
    expect(state.sendMessage).not.toHaveBeenCalled();

    await unmountClient(mounted);
  });

  it("prevents duplicate follow-ups while the first request is pending", async () => {
    let resolveFollowUp!: (response: Response) => void;
    const pendingFollowUp = new Promise<Response>((resolve) => {
      resolveFollowUp = resolve;
    });
    const fetchMock = vi.fn(() => pendingFollowUp);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const mounted = await mountClient();
    const useChatOptions = getUseChatOptions();

    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          status: "waiting",
          timestamp: 1,
          type: "session-status",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    const textarea = getComposer(mounted.container);
    await act(async () => {
      submitComposer(textarea, "Only once");
      submitComposer(textarea, "Only once");
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mounted.container.textContent).toContain(
      "A message is already being sent.",
    );

    await act(async () => {
      resolveFollowUp(
        Response.json({ ok: true, status: "queued" }, { status: 202 }),
      );
      await pendingFollowUp;
      await flushMicrotasks();
    });

    expect(textarea.value).toBe("Only once");

    await act(async () => {
      useChatOptions.onData({
        data: {
          content: "Only once",
          domain: "chat",
          id: JSON.parse(
            String(
              (
                fetchMock.mock.calls[0] as unknown as [
                  string,
                  { body?: unknown },
                ]
              )[1].body,
            ),
          ).messageId,
          timestamp: 3,
          type: "user-message",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    expect(textarea.value).toBe("");

    await unmountClient(mounted);
  });

  it("preserves active identity for a machine-readable follow-up conflict", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "chat_session_busy",
            message: "Chat session is processing another turn.",
          },
        },
        { status: 409 },
      ),
    ) as unknown as typeof fetch;
    const mounted = await mountClient();
    const useChatOptions = getUseChatOptions();

    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          status: "waiting",
          timestamp: 1,
          type: "session-status",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });
    const textarea = getComposer(mounted.container);
    await act(async () => {
      submitComposer(textarea, "Keep this draft");
      await flushMicrotasks();
    });

    expect(textarea.value).toBe("Keep this draft");
    expect(mounted.container.textContent).toContain("Run: run_1");
    expect(mounted.container.textContent).toContain(
      "Chat session is processing another turn.",
    );
    expect(state.stop).not.toHaveBeenCalled();
    expect(getButtonByText(mounted.container, "New Chat").disabled).toBe(true);

    await unmountClient(mounted);
  });

  it("retains the losing concurrent draft after workflow admission rejects it", async () => {
    let messageId = "";
    globalThis.fetch = vi.fn(async (_input, init) => {
      messageId = (JSON.parse(String(init?.body)) as { messageId: string })
        .messageId;
      return Response.json({ ok: true, status: "queued" }, { status: 202 });
    }) as unknown as typeof fetch;
    const mounted = await mountClient();
    const useChatOptions = getUseChatOptions();

    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          status: "waiting",
          timestamp: 1,
          type: "session-status",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    const textarea = getComposer(mounted.container);
    await act(async () => {
      submitComposer(textarea, "Do not lose this");
      await vi.waitFor(() => expect(messageId).not.toBe(""));
    });
    expect(textarea.value).toBe("Do not lose this");

    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          messageId,
          outcome: "rejected",
          reason: "stale_delivery",
          timestamp: 2,
          type: "follow-up-disposition",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    expect(textarea.value).toBe("Do not lose this");
    expect(mounted.container.textContent).toContain(
      "Another message won this chat turn.",
    );
    expect(mounted.container.textContent).toContain("Run: run_1");

    await unmountClient(mounted);
  });

  it("uses an authoritative cross-tab cancellation marker instead of generic finish", async () => {
    const mounted = await mountClient();
    const useChatOptions = getUseChatOptions();

    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          status: "canceled",
          timestamp: 5,
          type: "terminal",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    expect(mounted.container.textContent).toContain("Active chat · canceled");
    expect(mounted.container.textContent).not.toContain("Run: run_1");
    expect(getButtonByText(mounted.container, "New Chat").disabled).toBe(false);

    await unmountClient(mounted);
  });

  it("reuses the same message ID after an ambiguous follow-up error", async () => {
    const bodies: Array<{ messageId: string }> = [];
    let attempt = 0;
    globalThis.fetch = vi.fn(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as { messageId: string });
      attempt += 1;
      return attempt === 1
        ? Response.json(
            { error: { code: "internal_error", message: "Delivery unknown." } },
            { status: 500 },
          )
        : Response.json({ ok: true, status: "duplicate" });
    }) as unknown as typeof fetch;
    const mounted = await mountClient();
    const useChatOptions = getUseChatOptions();
    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          status: "waiting",
          timestamp: 1,
          type: "session-status",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    const textarea = getComposer(mounted.container);
    await act(async () => {
      submitComposer(textarea, "Retry safely");
      await vi.waitFor(() => expect(bodies).toHaveLength(1));
    });
    expect(textarea.value).toBe("Retry safely");
    await act(async () => {
      submitComposer(textarea, "Retry safely");
      await vi.waitFor(() => expect(bodies).toHaveLength(2));
    });

    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.messageId).toBe(bodies[1]?.messageId);
    expect(mounted.container.textContent).toContain("Run: run_1");

    await unmountClient(mounted);
  });

  it("rotates the message ID after a definitive payload conflict", async () => {
    const bodies: Array<{ messageId: string }> = [];
    globalThis.fetch = vi.fn(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as { messageId: string });
      return bodies.length === 1
        ? Response.json(
            {
              error: {
                code: "chat_message_id_conflict",
                message: "Message ID conflict.",
              },
            },
            { status: 409 },
          )
        : Response.json({ ok: true, status: "duplicate" });
    }) as unknown as typeof fetch;
    const mounted = await mountClient();
    const useChatOptions = getUseChatOptions();
    await act(async () => {
      useChatOptions.onData({
        data: {
          domain: "chat",
          status: "waiting",
          timestamp: 1,
          type: "session-status",
          version: 2,
        },
        type: "data-workflow",
      });
      await flushMicrotasks();
    });

    const textarea = getComposer(mounted.container);
    await act(async () => {
      submitComposer(textarea, "Retry with a new identity");
      await vi.waitFor(() => expect(bodies).toHaveLength(1));
    });
    expect(textarea.value).toBe("Retry with a new identity");

    await act(async () => {
      submitComposer(textarea, "Retry with a new identity");
      await vi.waitFor(() => expect(bodies).toHaveLength(2));
    });

    expect(bodies[0]?.messageId).not.toBe(bodies[1]?.messageId);
    expect(textarea.value).toBe("");

    await unmountClient(mounted);
  });
});
