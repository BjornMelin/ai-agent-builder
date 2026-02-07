// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  WebPreview,
  WebPreviewNavigation,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";

function WebPreviewHarness(props: Readonly<{ inputId: string }>) {
  return (
    <WebPreview defaultUrl="">
      <WebPreviewNavigation>
        <WebPreviewUrl id={props.inputId} />
      </WebPreviewNavigation>
    </WebPreview>
  );
}

describe("WebPreviewUrl hydration safety", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("preserves typed URL text before hydration", async () => {
    const inputId = "web-preview-url-input";
    const ui = <WebPreviewHarness inputId={inputId} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(ui);
    document.body.appendChild(container);

    const inputBeforeHydration = document.getElementById(inputId);
    expect(inputBeforeHydration).toBeInstanceOf(HTMLInputElement);
    if (!(inputBeforeHydration instanceof HTMLInputElement)) {
      throw new Error("Expected preview input element");
    }
    inputBeforeHydration.value = "example.com";

    let root: Root | null = null;
    await act(async () => {
      root = hydrateRoot(container, ui);
      await Promise.resolve();
    });

    const hydratedInput = document.getElementById(inputId);
    expect(hydratedInput).toBeInstanceOf(HTMLInputElement);
    if (!(hydratedInput instanceof HTMLInputElement)) {
      throw new Error("Expected hydrated preview input element");
    }
    expect(hydratedInput.value).toBe("example.com");

    await act(async () => {
      root?.unmount();
    });
  });
});
