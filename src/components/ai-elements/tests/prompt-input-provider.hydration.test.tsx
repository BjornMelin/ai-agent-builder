// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PromptInput,
  PromptInputBody,
  PromptInputProvider,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";

function PromptInputProviderHarness(props: Readonly<{ inputId: string }>) {
  return (
    <PromptInputProvider initialInput="" inputId={props.inputId}>
      <PromptInput
        onSubmit={async () => {
          return undefined;
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea />
        </PromptInputBody>
      </PromptInput>
    </PromptInputProvider>
  );
}

describe("PromptInputProvider hydration safety", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("preserves text typed before hydration in provider-controlled textarea", async () => {
    const inputId = "prompt-provider-textarea";
    const ui = <PromptInputProviderHarness inputId={inputId} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(ui);
    document.body.appendChild(container);

    const textareaBeforeHydration = document.getElementById(inputId);
    expect(textareaBeforeHydration).toBeInstanceOf(HTMLTextAreaElement);
    if (!(textareaBeforeHydration instanceof HTMLTextAreaElement)) {
      throw new Error("Expected prompt textarea element");
    }
    textareaBeforeHydration.value = "typed prompt text";

    let root: Root | null = null;
    await act(async () => {
      root = hydrateRoot(container, ui);
      await Promise.resolve();
    });

    const hydratedTextarea = document.getElementById(inputId);
    expect(hydratedTextarea).toBeInstanceOf(HTMLTextAreaElement);
    if (!(hydratedTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected hydrated prompt textarea element");
    }
    expect(hydratedTextarea.value).toBe("typed prompt text");

    await act(async () => {
      root?.unmount();
    });
  });
});
