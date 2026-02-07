// @vitest-environment jsdom

import type { ReactElement } from "react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSearchClient } from "@/app/(app)/projects/[projectId]/search/search-client";
import { GlobalSearchClient } from "@/app/(app)/search/search-client";

const navigationState = vi.hoisted(() => ({
  pathname: "/search",
  query: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({
    replace: navigationState.replace,
  }),
  useSearchParams: () =>
    new URLSearchParams(
      navigationState.query.length > 0 ? `q=${navigationState.query}` : "",
    ),
}));

type HydrationRoot = Readonly<{
  unmount: () => void;
}>;

describe("search hydration safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    navigationState.query = "";
    navigationState.pathname = "/search";
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  async function hydrateWithTypedValue(
    ui: ReactElement,
    inputId: string,
    typedValue: string,
  ) {
    const container = document.createElement("div");
    container.innerHTML = renderToString(ui);
    document.body.appendChild(container);

    const inputBeforeHydration = document.getElementById(inputId);
    expect(inputBeforeHydration).toBeInstanceOf(HTMLInputElement);
    if (!(inputBeforeHydration instanceof HTMLInputElement)) {
      throw new Error("Expected input element before hydration");
    }
    inputBeforeHydration.value = typedValue;

    let root: HydrationRoot | null = null;
    await act(async () => {
      root = hydrateRoot(container, ui) as HydrationRoot;
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });

    const hydratedInput = document.getElementById(inputId);
    expect(hydratedInput).toBeInstanceOf(HTMLInputElement);
    if (!(hydratedInput instanceof HTMLInputElement)) {
      throw new Error("Expected hydrated input element");
    }

    return {
      hydratedInput,
      unmount: () => {
        (root as HydrationRoot | null)?.unmount();
      },
    };
  }

  it("preserves pre-hydration text in global search", async () => {
    const { hydratedInput, unmount } = await hydrateWithTypedValue(
      <GlobalSearchClient />,
      "global-search",
      "typed-global",
    );
    expect(hydratedInput.value).toBe("typed-global");

    await act(async () => {
      unmount();
    });
  });

  it("preserves pre-hydration text in project search", async () => {
    navigationState.pathname = "/projects/project-1/search";
    const { hydratedInput, unmount } = await hydrateWithTypedValue(
      <ProjectSearchClient projectId="project-1" />,
      "project-search-project-1",
      "typed-project",
    );
    expect(hydratedInput.value).toBe("typed-project");

    await act(async () => {
      unmount();
    });
  });
});
