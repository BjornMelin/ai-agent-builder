import { describe, expect, it } from "vitest";

import { buildChatToolsForMode } from "@/lib/ai/tools/factory.server";

describe("buildChatToolsForMode", () => {
  it("returns retrieval-only tools for chat-assistant", () => {
    const tools = buildChatToolsForMode("chat-assistant");
    expect(Object.keys(tools).sort()).toEqual(["retrieveProjectChunks"]);
  });

  it("returns web research + report tools for researcher", () => {
    const tools = buildChatToolsForMode("researcher");
    expect(Object.keys(tools).sort()).toEqual(
      [
        "research.create-report",
        "retrieveProjectChunks",
        "web.extract",
        "web.search",
      ].sort(),
    );
  });

  it("returns retrieval + Context7 tools for architect", () => {
    const tools = buildChatToolsForMode("architect");
    expect(Object.keys(tools).sort()).toEqual(
      [
        "context7.query-docs",
        "context7.resolve-library-id",
        "retrieveProjectChunks",
      ].sort(),
    );
  });

  it("throws on unknown mode ids", () => {
    expect(() => buildChatToolsForMode("unknown-mode")).toThrowError(
      /Invalid agent mode|Unknown agent mode/,
    );
  });
});
