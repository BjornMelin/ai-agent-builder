import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FetchTimeoutError,
  fetchWithTimeout,
} from "@/lib/net/fetch-with-timeout.server";

function createAbortAwareFetchMock() {
  return vi
    .fn()
    .mockImplementation(
      (_input: unknown, init?: { signal?: AbortSignal | null }) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;

          const onAbort = () => reject(signal.reason);
          if (signal.aborted) {
            onAbort();
            return;
          }

          signal.addEventListener("abort", onAbort, { once: true });
        });
      },
    );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("returns the response when the upstream resolves within the budget", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithTimeout(
      "https://example.com",
      { method: "GET" },
      { timeoutMs: 50 },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws FetchTimeoutError when the timeout budget elapses", async () => {
    vi.useFakeTimers();

    const fetchMock = createAbortAwareFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithTimeout(
      "https://example.com",
      { method: "GET" },
      { timeoutMs: 10 },
    );
    const expectation =
      expect(promise).rejects.toBeInstanceOf(FetchTimeoutError);

    await vi.advanceTimersByTimeAsync(10);
    await expectation;

    await expect(promise).rejects.toMatchObject({ timeoutMs: 10 });
  });

  it("honors an external abort signal without re-wrapping as FetchTimeoutError", async () => {
    vi.useFakeTimers();

    const fetchMock = createAbortAwareFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const external = new AbortController();
    const abortErr = new Error("client aborted");

    const promise = fetchWithTimeout(
      "https://example.com",
      { method: "GET" },
      { signal: external.signal, timeoutMs: 100 },
    );
    const expectation = expect(promise).rejects.toBe(abortErr);

    external.abort(abortErr);
    await expectation;
  });

  it("honors init.signal abort without re-wrapping as FetchTimeoutError", async () => {
    vi.useFakeTimers();

    const fetchMock = createAbortAwareFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const initController = new AbortController();
    const abortErr = new Error("init aborted");

    const promise = fetchWithTimeout(
      "https://example.com",
      { method: "GET", signal: initController.signal },
      { timeoutMs: 100 },
    );
    const expectation = expect(promise).rejects.toBe(abortErr);

    initController.abort(abortErr);
    await expectation;
  });

  it("rejects timeoutMs outside [1, 120000]", async () => {
    const fetchMock = createAbortAwareFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithTimeout("https://example.com", undefined, { timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(RangeError);

    await expect(
      fetchWithTimeout("https://example.com", undefined, {
        timeoutMs: 999_999,
      }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
