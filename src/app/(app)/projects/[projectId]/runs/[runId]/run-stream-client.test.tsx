// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunStreamClient } from "./run-stream-client";

function createSseStream(chunks: string[]): ReadableStream<Uint8Array> {
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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
}

describe("RunStreamClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    if (globalThis.ResizeObserver === undefined) {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("marks the stream as done when the SSE ends without [DONE]", async () => {
    const fetchMock = vi.fn(async () => {
      const eventChunk = {
        data: {
          kind: "research",
          runId: "run_1",
          timestamp: 0,
          type: "run-started",
          workflowRunId: "wf_1",
        },
        type: "data-workflow",
      };

      const stream = createSseStream([
        `data: ${JSON.stringify(eventChunk)}\n\n`,
      ]);
      return new Response(stream, { status: 200 });
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RunStreamClient runId="run_1" />);
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Stream:");
    expect(container.textContent).toContain("done");
    expect(container.textContent).toContain(
      "Stream ended before a finish chunk.",
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("auto-reconnects and clears the interruption warning once [DONE] is received", async () => {
    const fetchMock = vi.fn();

    fetchMock.mockImplementationOnce(async () => {
      const eventChunk = {
        data: {
          kind: "research",
          runId: "run_1",
          timestamp: 0,
          type: "run-started",
          workflowRunId: "wf_1",
        },
        type: "data-workflow",
      };
      const stream = createSseStream([
        `data: ${JSON.stringify(eventChunk)}\n\n`,
      ]);
      return new Response(stream, { status: 200 });
    });

    fetchMock.mockImplementationOnce(async () => {
      const stream = createSseStream(["data: [DONE]\n\n"]);
      return new Response(stream, { status: 200 });
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RunStreamClient runId="run_1" />);
      await flushMicrotasks();
    });

    // Trigger the first auto-reconnect backoff (250ms).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Stream:");
    expect(container.textContent).toContain("done");
    expect(container.textContent).not.toContain(
      "Stream ended before a finish chunk.",
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
