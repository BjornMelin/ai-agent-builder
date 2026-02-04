import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Command, CommandInput } from "@/components/ui/command";

describe("CommandInput", () => {
  it("provides a default accessible label", () => {
    const html = renderToStaticMarkup(
      <Command>
        <CommandInput />
      </Command>,
    );

    expect(html).toContain('aria-label="Search"');
  });

  it("preserves a caller-provided accessible label", () => {
    const html = renderToStaticMarkup(
      <Command>
        <CommandInput aria-label="Search command palette" />
      </Command>,
    );

    expect(html).toContain('aria-label="Search command palette"');
  });
});
