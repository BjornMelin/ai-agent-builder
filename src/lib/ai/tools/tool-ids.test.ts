import { describe, expect, it } from "vitest";

import { type ToolId, toolIds } from "@/lib/ai/tools/tool-ids";

describe("tool ids", () => {
  it("exports a stable allowlist of tool identifiers", () => {
    expect(toolIds).toEqual([
      "retrieveProjectChunks",
      "web.search",
      "web.extract",
      "research.create-report",
      "context7.resolve-library-id",
      "context7.query-docs",
    ]);
  });

  it("ToolId is compatible with the exported ids (compile-time)", () => {
    const id: ToolId = toolIds[0];
    expect(typeof id).toBe("string");
  });
});
