// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommitTimestamp } from "@/components/ai-elements/commit";

describe("CommitTimestamp hydration behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("does not render a hydration-suppression attribute", () => {
    const html = renderToString(
      <CommitTimestamp date={new Date("2024-01-01T00:00:00.000Z")} />,
    );
    expect(html).not.toContain("suppresshydrationwarning");
  });

  it("starts deterministic and updates after mount", async () => {
    const commitDate = new Date("2024-01-01T00:00:00.000Z");
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    const ui = <CommitTimestamp date={commitDate} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(ui);
    document.body.appendChild(container);

    const beforeHydrationText = container.textContent;
    expect(beforeHydrationText).toBeTruthy();

    vi.setSystemTime(new Date("2024-01-03T00:00:00.000Z"));
    let root: Root | null = null;
    await act(async () => {
      root = hydrateRoot(container, ui);
      await Promise.resolve();
    });

    const afterHydrationText = container.textContent;
    expect(afterHydrationText).toBeTruthy();
    expect(afterHydrationText).not.toBe(beforeHydrationText);

    await act(async () => {
      root?.unmount();
    });
  });
});
