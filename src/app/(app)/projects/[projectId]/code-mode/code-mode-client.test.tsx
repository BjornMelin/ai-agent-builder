// @vitest-environment jsdom

import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ai-elements/terminal", () => ({
  Terminal: (props: Readonly<{ mode: string; output: string }>) => (
    <div data-mode={props.mode}>{props.output}</div>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: (props: Readonly<{ children?: ReactNode }>) => (
    <div>{props.children}</div>
  ),
  SelectContent: (props: Readonly<{ children?: ReactNode }>) => (
    <div>{props.children}</div>
  ),
  SelectItem: (props: Readonly<{ children?: ReactNode }>) => (
    <span>{props.children}</span>
  ),
  SelectTrigger: (props: ComponentProps<"button">) => (
    <button {...props} type="button" />
  ),
  SelectValue: () => null,
}));

import { CodeModeClient } from "./code-mode-client";

const originalFetch = globalThis.fetch;
const ACTIVE_RUN_STORAGE_KEY = "workflow:code-mode:active:v2:project_1";
const START_INDEX_STORAGE_KEY = "workflow:code-mode:v2:run_1:startIndex";

type MountedClient = Readonly<{
  container: HTMLDivElement;
  root: Root;
}>;

function createSseStream(
  chunks: readonly string[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function createOpenSseStream(): Readonly<{
  close: () => void;
  enqueue: (chunk: string) => void;
  stream: ReadableStream<Uint8Array>;
}> {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | null =
    null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });
  return {
    close: () => streamController?.close(),
    enqueue: (chunk) => streamController?.enqueue(encoder.encode(chunk)),
    stream,
  };
}

function persistActiveRunIdentity(): void {
  window.sessionStorage.setItem(
    ACTIVE_RUN_STORAGE_KEY,
    JSON.stringify({
      network: "none",
      projectId: "project_1",
      prompt: "Run `bun run test` and summarize any failures.",
      runId: "run_1",
      version: 2,
      workflowRunId: "wf_1",
    }),
  );
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function mountClient(): Promise<MountedClient> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<CodeModeClient projectId="project_1" />);
    await flushMicrotasks();
  });

  return { container, root };
}

async function unmountClient(mounted: MountedClient): Promise<void> {
  await act(async () => {
    mounted.root.unmount();
    await flushMicrotasks();
  });
  mounted.container.remove();
}

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  expect(button).toBeInstanceOf(HTMLButtonElement);
  return button as HTMLButtonElement;
}

describe("CodeModeClient lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    document.body.innerHTML = "";
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("hydrates active identity, reconnects from its cursor, and clears it after terminal success", async () => {
    persistActiveRunIdentity();
    window.sessionStorage.setItem(START_INDEX_STORAGE_KEY, "2");
    const terminalChunk = {
      data: {
        domain: "code-mode",
        status: "succeeded",
        timestamp: 1,
        type: "terminal",
        version: 2,
      },
      type: "data-workflow",
    };
    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0]) =>
        new Response(
          createSseStream([`data: ${JSON.stringify(terminalChunk)}\n\n`]),
          { status: 200 },
        ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/code-mode/run_1/stream?startIndex=2",
    );
    expect(mounted.container.textContent).toContain("Run: run_1");
    expect(mounted.container.textContent).toContain("Workflow: wf_1");
    expect(mounted.container.textContent).toContain("[succeeded]");
    expect(window.sessionStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(START_INDEX_STORAGE_KEY)).toBeNull();
    expect(getButton(mounted.container, "Start Code Mode").disabled).toBe(
      false,
    );

    await unmountClient(mounted);
  });

  it("keeps active identity when the transport closes without a terminal event", async () => {
    persistActiveRunIdentity();
    const fetchMock = vi.fn(async () =>
      Promise.resolve(
        new Response(createSseStream(["data: [DONE]\n\n"]), { status: 200 }),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(mounted.container.textContent).toContain(
      "Stream ended before a finish chunk.",
    );
    expect(
      window.sessionStorage.getItem(ACTIVE_RUN_STORAGE_KEY),
    ).not.toBeNull();
    expect(getButton(mounted.container, "Run active").disabled).toBe(true);
    expect(getButton(mounted.container, "Cancel").disabled).toBe(false);

    await unmountClient(mounted);
  });

  it("reconciles a terminal persisted status when the durable stream has no terminal event", async () => {
    persistActiveRunIdentity();
    const fetchMock = vi.fn(async () =>
      Promise.resolve(
        new Response(createSseStream(["data: [DONE]\n\n"]), {
          headers: { "x-code-mode-run-status": "succeeded" },
          status: 200,
        }),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(mounted.container.textContent).toContain("[succeeded]");
    expect(mounted.container.textContent).not.toContain(
      "Stream ended before a finish chunk.",
    );
    expect(window.sessionStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
    expect(getButton(mounted.container, "Start Code Mode").disabled).toBe(
      false,
    );

    await unmountClient(mounted);
  });

  it("keeps the active stream and identity usable when cancellation is rejected", async () => {
    persistActiveRunIdentity();
    const openStream = createOpenSseStream();
    const streamState: { signal?: AbortSignal } = {};
    const fetchMock = vi.fn(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url = String(input);
        if (url.includes("/stream")) {
          streamState.signal = init?.signal as AbortSignal;
          return new Response(openStream.stream, { status: 200 });
        }
        if (url.endsWith("/cancel")) {
          return Response.json(
            {
              error: {
                code: "conflict",
                message: "Cancellation rejected.",
              },
            },
            { status: 409 },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient();
    const cancelButton = getButton(mounted.container, "Cancel");

    await act(async () => {
      cancelButton.click();
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(streamState.signal?.aborted).toBe(false);
    expect(mounted.container.textContent).toContain("Cancellation rejected.");
    expect(getButton(mounted.container, "Cancel").disabled).toBe(false);
    expect(
      mounted.container.querySelector('[data-mode="streaming"]'),
    ).not.toBeNull();
    expect(
      window.sessionStorage.getItem(ACTIVE_RUN_STORAGE_KEY),
    ).not.toBeNull();

    await unmountClient(mounted);
    openStream.close();
  });

  it("reconciles terminal state after cancellation outlives stream retries", async () => {
    persistActiveRunIdentity();
    let streamRequests = 0;
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes("/stream")) {
        streamRequests += 1;
        return new Response(createSseStream(["data: [DONE]\n\n"]), {
          headers:
            streamRequests > 4
              ? { "x-code-mode-run-status": "canceled" }
              : { "x-code-mode-run-status": "running" },
          status: 200,
        });
      }
      if (url.endsWith("/cancel")) {
        return Response.json({ ok: true });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
      await flushMicrotasks();
    });

    expect(streamRequests).toBe(4);
    expect(mounted.container.textContent).toContain(
      "Stream ended before a finish chunk.",
    );

    await act(async () => {
      getButton(mounted.container, "Cancel").click();
      await flushMicrotasks();
    });

    expect(streamRequests).toBe(5);
    expect(mounted.container.textContent).toContain("[canceled]");
    expect(window.sessionStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
    expect(getButton(mounted.container, "Start Code Mode").disabled).toBe(
      false,
    );

    await unmountClient(mounted);
  });

  it("does not reconnect when the old stream finishes with cancellation", async () => {
    persistActiveRunIdentity();
    const openStream = createOpenSseStream();
    let streamRequests = 0;
    const terminalChunk = {
      data: {
        domain: "code-mode",
        status: "canceled",
        timestamp: 1,
        type: "terminal",
        version: 2,
      },
      type: "data-workflow",
    };
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes("/stream")) {
        streamRequests += 1;
        if (streamRequests === 1) {
          return new Response(openStream.stream, { status: 200 });
        }
        return new Response(createSseStream(["data: [DONE]\n\n"]), {
          headers: { "x-code-mode-run-status": "canceled" },
          status: 200,
        });
      }
      if (url.endsWith("/cancel")) {
        return Response.json({ ok: true });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient();
    await act(async () => {
      getButton(mounted.container, "Cancel").click();
      openStream.enqueue(`data: ${JSON.stringify(terminalChunk)}\n\n`);
      openStream.close();
      await flushMicrotasks();
    });

    expect(streamRequests).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mounted.container.textContent?.match(/\[canceled\]/g)).toHaveLength(
      1,
    );
    expect(window.sessionStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
    expect(getButton(mounted.container, "Start Code Mode").disabled).toBe(
      false,
    );

    await unmountClient(mounted);
  });

  it("guards two same-tick start submissions before React state commits", async () => {
    let resolveStart: ((response: Response) => void) | null = null;
    const startResponse = new Promise<Response>((resolve) => {
      resolveStart = resolve;
    });
    let startedRunId = "";
    const fetchMock = vi.fn(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url = String(input);
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { runId: string };
          startedRunId = body.runId;
          return await startResponse;
        }
        if (url.includes("/api/code-mode?")) {
          return Response.json({ run: null });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient();
    const startButton = getButton(mounted.container, "Start Code Mode");
    await act(async () => {
      startButton.click();
      startButton.click();
      await flushMicrotasks();
    });

    const posts = fetchMock.mock.calls.filter(
      (call) => call[1]?.method === "POST",
    );
    expect(posts).toHaveLength(1);
    expect(startedRunId).not.toBe("");
    expect(window.sessionStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toContain(
      startedRunId,
    );

    await act(async () => {
      resolveStart?.(
        Response.json({
          network: "none",
          projectId: "project_1",
          prompt: "Run `bun run test` and summarize any failures.",
          runId: startedRunId,
          status: "pending",
          workflowRunId: null,
        }),
      );
      await flushMicrotasks();
    });
    await unmountClient(mounted);
  });

  it("clears a pending identity after a definite start rejection", async () => {
    const fetchMock = vi.fn(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        if (init?.method === "POST") {
          return Response.json(
            { error: { code: "bad_request", message: "Prompt is required." } },
            { status: 400 },
          );
        }
        if (String(input).includes("/api/code-mode?")) {
          return Response.json({ run: null });
        }
        throw new Error(`Unexpected request: ${String(input)}`);
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient();
    await act(async () => {
      getButton(mounted.container, "Start Code Mode").click();
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
    expect(getButton(mounted.container, "Start Code Mode").disabled).toBe(
      false,
    );
    expect(mounted.container.textContent).toContain("Prompt is required.");

    await unmountClient(mounted);
  });

  it("recovers a client-known pending run after a lost response and reload", async () => {
    window.sessionStorage.setItem(
      ACTIVE_RUN_STORAGE_KEY,
      JSON.stringify({
        network: "none",
        projectId: "project_1",
        prompt: "Run `bun run test` and summarize any failures.",
        runId: "run_lost_response",
        version: 2,
        workflowRunId: null,
      }),
    );
    const openStream = createOpenSseStream();
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (
        url.includes("/api/code-mode?") &&
        url.includes("run_lost_response")
      ) {
        return Response.json({
          run: {
            network: "none",
            projectId: "project_1",
            prompt: "Run `bun run test` and summarize any failures.",
            runId: "run_lost_response",
            status: "running",
            workflowRunId: "wf_recovered",
          },
        });
      }
      if (url.includes("/run_lost_response/stream")) {
        return new Response(openStream.stream, { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(mounted.container.textContent).toContain("Run: run_lost_response");
    expect(mounted.container.textContent).toContain("Workflow: wf_recovered");
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("runId=run_lost_response"),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("/run_lost_response/stream"),
      ),
    ).toBe(true);

    openStream.close();
    await unmountClient(mounted);
  });

  it("polls the known run until its Workflow self-registration is durable", async () => {
    window.sessionStorage.setItem(
      ACTIVE_RUN_STORAGE_KEY,
      JSON.stringify({
        network: "none",
        projectId: "project_1",
        prompt: "Run `bun run test` and summarize any failures.",
        runId: "run_pending_registration",
        version: 2,
        workflowRunId: null,
      }),
    );
    const openStream = createOpenSseStream();
    let knownLookups = 0;
    const fetchMock = vi.fn(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url = String(input);
        if (url.includes("runId=run_pending_registration")) {
          knownLookups += 1;
          return Response.json({
            run: {
              network: "none",
              projectId: "project_1",
              prompt: "Run `bun run test` and summarize any failures.",
              runId: "run_pending_registration",
              status: knownLookups > 1 ? "running" : "pending",
              workflowRunId: knownLookups > 1 ? "wf_polled" : null,
            },
          });
        }
        if (init?.method === "POST") {
          return Response.json({
            network: "none",
            projectId: "project_1",
            prompt: "Run `bun run test` and summarize any failures.",
            runId: "run_pending_registration",
            status: "pending",
            workflowRunId: null,
          });
        }
        if (url.includes("/run_pending_registration/stream")) {
          return new Response(openStream.stream, { status: 200 });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
      await flushMicrotasks();
    });

    expect(knownLookups).toBeGreaterThanOrEqual(2);
    expect(mounted.container.textContent).toContain("Workflow: wf_polled");
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("/run_pending_registration/stream"),
      ),
    ).toBe(true);

    openStream.close();
    await unmountClient(mounted);
  });

  it("discovers the canonical run after an ambiguous start transport error", async () => {
    const openStream = createOpenSseStream();
    let startedRunId = "";
    const fetchMock = vi.fn(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url = String(input);
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { runId: string };
          startedRunId = body.runId;
          throw new TypeError("response lost");
        }
        if (url.includes("/api/code-mode?") && url.includes("runId=")) {
          return Response.json({
            run: {
              network: "none",
              projectId: "project_1",
              prompt: "Run `bun run test` and summarize any failures.",
              runId: startedRunId,
              status: "running",
              workflowRunId: "wf_after_loss",
            },
          });
        }
        if (url.includes("/api/code-mode?")) {
          return Response.json({ run: null });
        }
        if (url.includes(`/${startedRunId}/stream`)) {
          return new Response(openStream.stream, { status: 200 });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient();
    await act(async () => {
      getButton(mounted.container, "Start Code Mode").click();
      await flushMicrotasks();
    });

    expect(startedRunId).not.toBe("");
    expect(mounted.container.textContent).toContain("Workflow: wf_after_loss");
    expect(window.sessionStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toContain(
      "wf_after_loss",
    );
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes(`runId=${startedRunId}`),
      ),
    ).toBe(true);

    openStream.close();
    await unmountClient(mounted);
  });

  it("retains the pre-POST identity when startup and discovery transports fail", async () => {
    let initialDiscoveryComplete = false;
    const fetchMock = vi.fn(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url = String(input);
        if (!initialDiscoveryComplete && url.includes("/api/code-mode?")) {
          initialDiscoveryComplete = true;
          return Response.json({ run: null });
        }
        if (init?.method === "POST") throw new TypeError("response lost");
        if (url.includes("/api/code-mode?")) {
          throw new TypeError("discovery unavailable");
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient();
    await act(async () => {
      getButton(mounted.container, "Start Code Mode").click();
      await flushMicrotasks();
    });

    const stored = window.sessionStorage.getItem(ACTIVE_RUN_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(stored).toContain('"workflowRunId":null');
    expect(getButton(mounted.container, "Run active").disabled).toBe(true);
    expect(mounted.container.textContent).toContain(
      "run identity is saved for reconciliation",
    );

    await unmountClient(mounted);
  });
});
