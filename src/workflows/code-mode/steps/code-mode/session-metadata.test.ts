import { describe, expect, it } from "vitest";
import { parseCodeModeRunMetadata } from "./session-metadata";

describe("parseCodeModeRunMetadata", () => {
  it("throws bad_request when metadata is invalid", () => {
    expect(() => parseCodeModeRunMetadata({ prompt: "" })).toThrow(
      /invalid code mode run metadata/i,
    );
  });

  it("parses valid metadata and trims prompt", () => {
    const meta = parseCodeModeRunMetadata({
      budgets: { maxSteps: 2, timeoutMs: 10_000 },
      networkAccess: "restricted",
      origin: "code-mode",
      prompt: "  Say hi  ",
    });

    expect(meta.prompt).toBe("Say hi");
    expect(meta.origin).toBe("code-mode");
    expect(meta.networkAccess).toBe("restricted");
    expect(meta.budgets?.maxSteps).toBe(2);
  });
});
