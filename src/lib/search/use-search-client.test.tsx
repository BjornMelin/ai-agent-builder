// @vitest-environment jsdom

import type { ReactElement } from "react";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResponse } from "@/lib/search/types";
import type { UseSearchClientResult } from "@/lib/search/use-search-client";

const navigationState = vi.hoisted(() => ({
  pathname: "/search",
  query: "",
}));

const state = vi.hoisted(() => ({
  consumeUrlQueryChange:
    vi.fn<
      (
        urlQuery: string,
      ) => Readonly<{ shouldExecute: boolean; syncInput: boolean }>
    >(),
  maybeSkipAndSync:
    vi.fn<
      (
        query: string,
        options: Readonly<{ syncInput: boolean; syncUrl: boolean }>,
      ) => void
    >(),
  parseSearchResponse: vi.fn<(json: unknown) => SearchResponse>(),
  replaceMock: vi.fn((href: string) => {
    const next = new URL(href, window.location.origin);
    navigationState.pathname = next.pathname;
    navigationState.query = next.searchParams.get("q") ?? "";
  }),
  setQ: vi.fn<(next: string) => void>(),
  syncQueryInUrl: null as null | ((query: string) => void),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({
    replace: state.replaceMock,
  }),
  useSearchParams: () =>
    new URLSearchParams(
      navigationState.query.length > 0
        ? `q=${encodeURIComponent(navigationState.query)}`
        : "",
    ),
}));

vi.mock("@/app/(app)/search/use-url-query-sync", () => ({
  useUrlQuerySync: (input: {
    syncQueryInUrl: (query: string) => void;
    urlQuery: string;
  }) => {
    state.syncQueryInUrl = input.syncQueryInUrl;
    void input.urlQuery;
    return {
      consumeUrlQueryChange: state.consumeUrlQueryChange,
      maybeSkipAndSync: state.maybeSkipAndSync,
    };
  },
}));

vi.mock("@/lib/react/use-hydration-safe-input-state", () => ({
  useHydrationSafeTextState: (_opts: unknown) => ["", state.setQ] as const,
}));

vi.mock("@/lib/search/parse-search-response", () => ({
  parseSearchResponse: (json: unknown) => state.parseSearchResponse(json),
}));

type Mounted = Readonly<{
  container: HTMLDivElement;
  root: Root;
}>;

const lastClientRef: { current: UseSearchClientResult | null } = {
  current: null,
};

async function createHarnessElement(): Promise<ReactElement> {
  const { useSearchClient } = await import("./use-search-client");

  function Harness(): ReactElement {
    const client = useSearchClient({
      buildSearchParams: (_query) => new URLSearchParams(),
      inputId: "search",
    });
    useEffect(() => {
      lastClientRef.current = client;
    }, [client]);
    return (
      <div
        data-error={client.error ?? ""}
        data-has-searched={String(client.hasSearched)}
        data-q={client.q}
        data-results={String(client.results.length)}
        data-status={client.status}
      />
    );
  }

  return <Harness />;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function mount(ui: ReactElement): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(ui);
    await vi.runOnlyPendingTimersAsync();
    await flushMicrotasks();
  });

  return { container, root };
}

const originalFetch = globalThis.fetch;

function getHarnessNode(mounted: Mounted): HTMLDivElement {
  const el = mounted.container.querySelector<HTMLDivElement>("div");
  if (!el) throw new Error("Missing harness node.");
  return el;
}

function readAttr(el: HTMLDivElement, name: string): string {
  const value = el.getAttribute(name);
  if (value === null) throw new Error(`Missing attribute ${name}.`);
  return value;
}

describe("useSearchClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
    document.body.innerHTML = "";
    lastClientRef.current = null;

    navigationState.pathname = "/search";
    navigationState.query = "";
    window.history.pushState({}, "", "/search");

    state.consumeUrlQueryChange.mockReturnValue({
      shouldExecute: false,
      syncInput: false,
    });
    state.parseSearchResponse.mockReturnValue({
      meta: {
        limit: 20,
        scope: "global",
        types: ["projects"],
      },
      results: [],
    });

    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    document.body.innerHTML = "";
  });

  it("syncQueryInUrl adds and removes the q param", async () => {
    await mount(await createHarnessElement());
    if (!state.syncQueryInUrl) {
      throw new Error("Missing syncQueryInUrl.");
    }

    state.syncQueryInUrl("alpha");
    expect(state.replaceMock).toHaveBeenCalledWith("/search?q=alpha", {
      scroll: false,
    });

    state.syncQueryInUrl("");
    expect(state.replaceMock).toHaveBeenCalledWith("/search", {
      scroll: false,
    });
  });

  it("resets state for short queries and does not call fetch", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mount(await createHarnessElement());
    const node = getHarnessNode(mounted);

    await act(async () => {
      await lastClientRef.current?.executeSearch("a", {
        syncInput: true,
        syncUrl: true,
      });
      await flushMicrotasks();
    });

    expect(state.setQ).toHaveBeenCalledWith("a");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.maybeSkipAndSync).toHaveBeenCalledWith("a", {
      syncInput: true,
      syncUrl: true,
    });

    expect(readAttr(node, "data-status")).toBe("idle");
    expect(readAttr(node, "data-error")).toBe("");
    expect(readAttr(node, "data-results")).toBe("0");
    expect(readAttr(node, "data-has-searched")).toBe("false");
  });

  it("surfaces server errors when response is not ok", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: "Nope" } }), {
        headers: { "content-type": "application/json" },
        status: 500,
      });
    }) as unknown as typeof fetch;

    const mounted = await mount(await createHarnessElement());
    const node = getHarnessNode(mounted);

    await act(async () => {
      await lastClientRef.current?.executeSearch("alpha", {
        syncInput: false,
        syncUrl: false,
      });
      await flushMicrotasks();
    });

    expect(readAttr(node, "data-status")).toBe("error");
    expect(readAttr(node, "data-error")).toBe("Nope");
    expect(readAttr(node, "data-has-searched")).toBe("true");
  });

  it("handles unexpected server responses when parsing fails", async () => {
    state.parseSearchResponse.mockImplementationOnce(() => {
      throw new Error("bad payload");
    });
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({}), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }) as unknown as typeof fetch;

    const mounted = await mount(await createHarnessElement());
    const node = getHarnessNode(mounted);

    await act(async () => {
      await lastClientRef.current?.executeSearch("alpha", {
        syncInput: false,
        syncUrl: false,
      });
      await flushMicrotasks();
    });

    expect(readAttr(node, "data-status")).toBe("error");
    expect(readAttr(node, "data-error")).toBe(
      "Search failed due to an unexpected server response.",
    );
    expect(readAttr(node, "data-results")).toBe("0");
  });

  it("handles network errors", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;

    const mounted = await mount(await createHarnessElement());
    const node = getHarnessNode(mounted);

    await act(async () => {
      await lastClientRef.current?.executeSearch("alpha", {
        syncInput: false,
        syncUrl: false,
      });
      await flushMicrotasks();
    });

    expect(readAttr(node, "data-status")).toBe("error");
    expect(readAttr(node, "data-error")).toBe(
      "Network error. Please try again.",
    );
  });

  it("ignores AbortError failures for the active request", async () => {
    globalThis.fetch = vi.fn(async () => {
      const err = new Error("aborted");
      (err as unknown as { name?: unknown }).name = "AbortError";
      throw err;
    }) as unknown as typeof fetch;

    const mounted = await mount(await createHarnessElement());
    const node = getHarnessNode(mounted);

    await act(async () => {
      await lastClientRef.current?.executeSearch("alpha", {
        syncInput: false,
        syncUrl: false,
      });
      await flushMicrotasks();
    });

    // Hook intentionally ignores abort errors. Status remains "loading" until superseded.
    expect(readAttr(node, "data-error")).toBe("");
    expect(readAttr(node, "data-status")).toBe("loading");
  });

  it("does not let stale responses overwrite the latest results", async () => {
    let resolveFirst: ((res: Response) => void) | null = null;
    const fetchMock = vi.fn(async (url: string) => {
      const q = new URL(url).searchParams.get("q") ?? "";
      if (q === "alpha") {
        return await new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return new Response(
        JSON.stringify({
          meta: {
            limit: 20,
            scope: "global",
            types: ["projects"],
          },
          results: [
            { href: "/projects/p1", id: "p1", title: "beta", type: "project" },
          ],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    state.parseSearchResponse.mockImplementation(
      (json) => json as SearchResponse,
    );

    const mounted = await mount(await createHarnessElement());
    const node = getHarnessNode(mounted);

    await act(async () => {
      void lastClientRef.current?.executeSearch("alpha", {
        syncInput: false,
        syncUrl: false,
      });
      await flushMicrotasks();
      await lastClientRef.current?.executeSearch("beta", {
        syncInput: false,
        syncUrl: false,
      });
      await flushMicrotasks();
    });

    expect(readAttr(node, "data-results")).toBe("1");
    expect(readAttr(node, "data-status")).toBe("idle");

    await act(async () => {
      if (!resolveFirst) throw new Error("Missing first resolver.");
      resolveFirst(
        new Response(
          JSON.stringify({
            meta: {
              limit: 20,
              scope: "global",
              types: ["projects"],
            },
            results: [
              {
                href: "/projects/p2",
                id: "p2",
                title: "alpha",
                type: "project",
              },
            ],
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      );
      await flushMicrotasks();
    });

    // Still one result (beta), alpha's late response should be ignored.
    expect(readAttr(node, "data-results")).toBe("1");

    await act(async () => {
      mounted.root.unmount();
    });
  });
});
