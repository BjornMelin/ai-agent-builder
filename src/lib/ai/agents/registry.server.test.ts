import { withEnv } from "@tests/utils/env";
import { describe, expect, it, vi } from "vitest";

async function loadRegistry() {
  vi.resetModules();
  return await import("@/lib/ai/agents/registry.server");
}

describe("agent mode registry (server)", () => {
  it("rejects unknown mode ids", async () => {
    await withEnv({}, async () => {
      const { getEnabledAgentMode } = await loadRegistry();
      expect(() => getEnabledAgentMode("nope")).toThrowError(
        /invalid|unknown/i,
      );
    });
  });

  it("filters out web research modes when EXA/FIRECRAWL env is missing", async () => {
    await withEnv(
      { EXA_API_KEY: undefined, FIRECRAWL_API_KEY: undefined },
      async () => {
        const { listEnabledAgentModes } = await loadRegistry();
        const modeIds = listEnabledAgentModes().map((m) => m.modeId);
        expect(modeIds).not.toContain("researcher");
        expect(modeIds).toContain("chat-assistant");
      },
    );
  });

  it("enables researcher when web research env is configured", async () => {
    await withEnv(
      { EXA_API_KEY: "exa-test", FIRECRAWL_API_KEY: "fc-test" },
      async () => {
        const { listEnabledAgentModes } = await loadRegistry();
        const modeIds = listEnabledAgentModes().map((m) => m.modeId);
        expect(modeIds).toContain("researcher");
      },
    );
  });

  it("enables architect when Context7 env is configured", async () => {
    await withEnv({ CONTEXT7_API_KEY: "ctx7-test" }, async () => {
      const { listEnabledAgentModes } = await loadRegistry();
      const modeIds = listEnabledAgentModes().map((m) => m.modeId);
      expect(modeIds).toContain("architect");
    });
  });
});
