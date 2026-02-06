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

function createSearchResponse(): Response {
  return new Response(
    JSON.stringify({
      meta: {
        limit: 20,
        q: "alpha",
        scope: "global",
        types: ["projects"],
      },
      results: [],
    }),
    {
      headers: { "content-type": "application/json" },
      status: 200,
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
    document.body.innerHTML = "";
  });

  it("does not issue duplicate fetches for global search submits", async () => {
    const fetchMock = vi.fn(async () => createSearchResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mounted = await mountClient(<GlobalSearchClient />);
    await submitSearch(mounted, "global-search", "alpha");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      mounted.root.unmount();
    });
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

    await act(async () => {
      mounted.root.unmount();
    });
  });
});
