import { withEnv } from "@tests/utils/env";
import { describe, expect, it, vi } from "vitest";

async function loadFactory() {
  vi.resetModules();
  return await import("@/lib/ai/tools/factory.server");
}

describe("buildChatToolsForMode", () => {
  it("returns retrieval-only tools for chat-assistant", async () => {
    await withEnv({}, async () => {
      const { buildChatToolsForMode } = await loadFactory();
      const tools = buildChatToolsForMode("chat-assistant");
      expect(Object.keys(tools).sort()).toEqual(["retrieveProjectChunks"]);
    });
  });

  it("returns web research + report tools for researcher when web research env is configured", async () => {
    await withEnv(
      { EXA_API_KEY: "exa-test", FIRECRAWL_API_KEY: "fc-test" },
      async () => {
        const { buildChatToolsForMode } = await loadFactory();
        const tools = buildChatToolsForMode("researcher");
        expect(Object.keys(tools).sort()).toEqual(
          [
            "research.create-report",
            "retrieveProjectChunks",
            "web.extract",
            "web.search",
          ].sort(),
        );
      },
    );
  });

  it("throws when researcher is requested but web research env is missing", async () => {
    await withEnv(
      { EXA_API_KEY: undefined, FIRECRAWL_API_KEY: undefined },
      async () => {
        const { buildChatToolsForMode } = await loadFactory();
        expect(() => buildChatToolsForMode("researcher")).toThrowError(
          /not available|web research|env/i,
        );
      },
    );
  });

  it("returns retrieval + Context7 tools for architect when Context7 env is configured", async () => {
    await withEnv({ CONTEXT7_API_KEY: "ctx7-test" }, async () => {
      const { buildChatToolsForMode } = await loadFactory();
      const tools = buildChatToolsForMode("architect");
      expect(Object.keys(tools).sort()).toEqual(
        [
          "context7.query-docs",
          "context7.resolve-library-id",
          "retrieveProjectChunks",
        ].sort(),
      );
    });
  });

  it("throws when architect is requested but Context7 env is missing", async () => {
    await withEnv({ CONTEXT7_API_KEY: undefined }, async () => {
      const { buildChatToolsForMode } = await loadFactory();
      expect(() => buildChatToolsForMode("architect")).toThrowError(
        /not available|context7|env/i,
      );
    });
  });

  it("throws on unknown mode ids", async () => {
    await withEnv({}, async () => {
      const { buildChatToolsForMode } = await loadFactory();
      expect(() => buildChatToolsForMode("unknown-mode")).toThrowError(
        /invalid|unknown/i,
      );
    });
  });
});
