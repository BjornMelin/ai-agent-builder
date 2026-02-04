import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CodeBlockCopyButton } from "@/components/ai-elements/code-block";

describe("CodeBlockCopyButton", () => {
  it("provides a default accessible name for icon-only usage", () => {
    const html = renderToStaticMarkup(<CodeBlockCopyButton />);
    expect(html).toContain('aria-label="Copy code"');
  });

  it("preserves a caller-provided accessible name", () => {
    const html = renderToStaticMarkup(
      <CodeBlockCopyButton aria-label="Copy snippet output" />,
    );
    expect(html).toContain('aria-label="Copy snippet output"');
  });
});
