// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readHydratedTextValue,
  useHydrationSafeTextState,
} from "@/lib/react/use-hydration-safe-input-state";

function HydrationSafeInput(props: Readonly<{ fallback: string; id: string }>) {
  const [value, setValue] = useHydrationSafeTextState({
    element: "input",
    elementId: props.id,
    fallback: props.fallback,
  });

  return (
    <input
      id={props.id}
      onChange={(event) => setValue(event.currentTarget.value)}
      value={value}
    />
  );
}

describe("useHydrationSafeTextState", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("preserves text typed before hydration", async () => {
    const inputId = "hydration-safe-input";
    const ui = <HydrationSafeInput fallback="" id={inputId} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(ui);
    document.body.appendChild(container);

    const inputBeforeHydration = document.getElementById(inputId);
    expect(inputBeforeHydration).toBeInstanceOf(HTMLInputElement);
    if (!(inputBeforeHydration instanceof HTMLInputElement)) {
      throw new Error("Expected input element");
    }
    inputBeforeHydration.value = "typed-before-hydration";

    let root: Root | null = null;
    await act(async () => {
      root = hydrateRoot(container, ui);
      await Promise.resolve();
    });

    const hydratedInput = document.getElementById(inputId);
    expect(hydratedInput).toBeInstanceOf(HTMLInputElement);
    if (!(hydratedInput instanceof HTMLInputElement)) {
      throw new Error("Expected hydrated input element");
    }
    expect(hydratedInput.value).toBe("typed-before-hydration");

    await act(async () => {
      root?.unmount();
    });
  });

  it("falls back when the input does not exist", () => {
    const value = readHydratedTextValue({
      element: "input",
      elementId: "missing-input-id",
      fallback: "fallback-value",
    });
    expect(value).toBe("fallback-value");
  });
});
