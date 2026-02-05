import { describe, expect, it } from "vitest";

import { resolveRunStatusAfterChatEnd } from "./run-status";

describe("resolveRunStatusAfterChatEnd", () => {
  it("preserves null and terminal failure statuses", () => {
    expect(resolveRunStatusAfterChatEnd(null)).toBeNull();
    expect(resolveRunStatusAfterChatEnd("failed")).toBe("failed");
    expect(resolveRunStatusAfterChatEnd("canceled")).toBe("canceled");
  });

  it("marks non-terminal statuses as succeeded", () => {
    expect(resolveRunStatusAfterChatEnd("pending")).toBe("succeeded");
    expect(resolveRunStatusAfterChatEnd("running")).toBe("succeeded");
    expect(resolveRunStatusAfterChatEnd("waiting")).toBe("succeeded");
    expect(resolveRunStatusAfterChatEnd("blocked")).toBe("succeeded");
    expect(resolveRunStatusAfterChatEnd("succeeded")).toBe("succeeded");
  });
});
