// @vitest-environment jsdom

import type { ReactElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectSearchClient } from "@/app/(app)/projects/[projectId]/search/search-client";
import { GlobalSearchClient } from "@/app/(app)/search/search-client";

const navigationState = vi.hoisted(() => ({
  pathname: "/search",
  query: "",
}));

const originalFetch = globalThis.fetch;

const replaceMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    const nextUrl = new URL(href, "http://localhost");
    navigationState.pathname = nextUrl.pathname;
    navigationState.query = nextUrl.searchParams.get("q") ?? "";
  }),
);

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () =>
    new URLSearchParams(
      navigationState.query.length > 0
        ? `q=${encodeURIComponent(navigationState.query)}`
        : "",
    ),
}));

type MountedClient = Readonly<{
  container: HTMLDivElement;
  root: Root;
}>;

function createSearchResponse(
  input?: Readonly<{ body?: unknown; status?: number }>,
): Response {
  return new Response(
    JSON.stringify(
      input?.body ?? {
        meta: {
          limit: 20,
          scope: "global",
          types: ["projects"],
        },
        results: [],
      },
    ),
    {
      headers: { "content-type": "application/json" },
      status: input?.status ?? 200,
    },
  );
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function mountClient(ui: ReactElement): Promise<MountedClient> {
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

async function submitSearch(
  mounted: MountedClient,
  inputId: string,
  query: string,
): Promise<void> {
  const input = mounted.container.querySelector<HTMLInputElement>(
    `#${inputId}`,
  );
  if (!input) {
    throw new Error(`Missing input #${inputId}`);
  }
  const form = input.closest("form");
  if (!form) {
    throw new Error(`Missing form for input #${inputId}`);
  }

  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    );
    const setValue = descriptor?.set;
    if (!setValue) {
      throw new Error("Missing HTMLInputElement value setter.");
    }
    setValue.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await flushMicrotasks();
  });

  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
    await flushMicrotasks();
  });
}

async function unmountClient(mounted: MountedClient): Promise<void> {
  await act(async () => {
    mounted.root.unmount();
  });
}

function getAlertText(container: HTMLElement, id: string): string | null {
  const el = container.querySelector<HTMLElement>(`#${id}[role="alert"]`);
  return el?.textContent ?? null;
}

describe("search clients submit behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    navigationState.pathname = "/search";
    navigationState.query = "";
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    document.body.innerHTML = "";
  });

  it("does not issue duplicate fetches for global search submits", async () => {
    const fetchMock = vi.fn(async () => createSearchResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient(<GlobalSearchClient />);
    await submitSearch(mounted, "global-search", "alpha");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledTimes(1);

    await unmountClient(mounted);
  });

  it("does not issue duplicate fetches for project search submits", async () => {
    navigationState.pathname = "/projects/project-1/search";
    const fetchMock = vi.fn(async () => createSearchResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient(
      <ProjectSearchClient projectId="project-1" />,
    );
    await submitSearch(mounted, "project-search-project-1", "alpha");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledTimes(1);

    await unmountClient(mounted);
  });

  it("does not call fetch for short queries (<2 chars) and keeps the idle message", async () => {
    const fetchMock = vi.fn(async () => createSearchResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient(<GlobalSearchClient />);
    await submitSearch(mounted, "global-search", "a");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(navigationState.query).toBe("a");
    expect(mounted.container.textContent).toContain(
      "Enter at least 2 characters to search all projects.",
    );
    expect(getAlertText(mounted.container, "global-search-error")).toBeNull();

    await unmountClient(mounted);
  });

  it("renders an error alert when the server responds with a non-OK status", async () => {
    const fetchMock = vi.fn(async () =>
      createSearchResponse({
        body: { error: { message: "Nope" } },
        status: 500,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient(<GlobalSearchClient />);
    await submitSearch(mounted, "global-search", "alpha");

    expect(getAlertText(mounted.container, "global-search-error")).toBe("Nope");

    await unmountClient(mounted);
  });

  it("renders an error alert when the response payload cannot be parsed", async () => {
    const fetchMock = vi.fn(async () =>
      createSearchResponse({
        body: {},
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient(<GlobalSearchClient />);
    await submitSearch(mounted, "global-search", "alpha");

    expect(getAlertText(mounted.container, "global-search-error")).toBe(
      "Search failed due to an unexpected server response.",
    );

    await unmountClient(mounted);
  });

  it("renders a network error when fetch throws", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("boom");
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient(<GlobalSearchClient />);
    await submitSearch(mounted, "global-search", "alpha");

    expect(getAlertText(mounted.container, "global-search-error")).toBe(
      "Network error. Please try again.",
    );

    await unmountClient(mounted);
  });

  it("ignores AbortError failures for the active request (no alert, remains loading)", async () => {
    const fetchMock = vi.fn(async () => {
      const err = new Error("aborted");
      (err as unknown as { name?: unknown }).name = "AbortError";
      throw err;
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient(<GlobalSearchClient />);
    await submitSearch(mounted, "global-search", "alpha");

    expect(getAlertText(mounted.container, "global-search-error")).toBeNull();

    const button = mounted.container.querySelector("button[type='submit']");
    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect((button as HTMLButtonElement).disabled).toBe(true);

    await unmountClient(mounted);
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

      return createSearchResponse({
        body: {
          meta: {
            limit: 20,
            scope: "global",
            types: ["projects"],
          },
          results: [
            {
              href: "/projects/p1",
              id: "p1",
              title: "beta",
              type: "project",
            },
          ],
        },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient(<GlobalSearchClient />);
    await submitSearch(mounted, "global-search", "alpha");
    await submitSearch(mounted, "global-search", "beta");

    expect(mounted.container.textContent).toContain("beta");
    expect(mounted.container.textContent).not.toContain("alpha");

    await act(async () => {
      if (!resolveFirst) throw new Error("Missing first resolver.");
      resolveFirst(
        createSearchResponse({
          body: {
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
          },
        }),
      );
      await flushMicrotasks();
    });

    // Still beta, alpha's late response should be ignored.
    expect(mounted.container.textContent).toContain("beta");
    expect(mounted.container.textContent).not.toContain("alpha");

    await unmountClient(mounted);
  });
});
