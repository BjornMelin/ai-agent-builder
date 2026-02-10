import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: {
    aiGateway: {
      chatModel: "openai/gpt-4o",
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("agent modes", () => {
  it("chat assistant mode reads defaultModel from env and declares its tool contract", async () => {
    const { chatAssistantMode } = await import(
      "@/lib/ai/agents/modes/chat-assistant"
    );

    expect(chatAssistantMode.modeId).toBe("chat-assistant");
    expect(chatAssistantMode.allowedTools).toEqual([
      "skills.load",
      "skills.readFile",
      "retrieveProjectChunks",
    ]);
    expect(chatAssistantMode.requirements).toEqual({
      context7: false,
      webResearch: false,
    });
    expect(chatAssistantMode.defaultModel).toBe("openai/gpt-4o");
  });

  it("architect mode enables Context7 tools and reads defaultModel from env", async () => {
    const { architectMode } = await import("@/lib/ai/agents/modes/architect");

    expect(architectMode.modeId).toBe("architect");
    expect(architectMode.allowedTools).toEqual([
      "skills.load",
      "skills.readFile",
      "retrieveProjectChunks",
      "context7.resolve-library-id",
      "context7.query-docs",
    ]);
    expect(architectMode.requirements).toEqual({
      context7: true,
      webResearch: false,
    });
    expect(architectMode.defaultModel).toBe("openai/gpt-4o");
  });

  it("researcher mode enables web research tools and reads defaultModel from env", async () => {
    const { researcherMode } = await import("@/lib/ai/agents/modes/researcher");

    expect(researcherMode.modeId).toBe("researcher");
    expect(researcherMode.allowedTools).toEqual([
      "skills.load",
      "skills.readFile",
      "retrieveProjectChunks",
      "web.search",
      "web.extract",
      "research.create-report",
    ]);
    expect(researcherMode.requirements).toEqual({
      context7: false,
      webResearch: true,
    });
    expect(researcherMode.defaultModel).toBe("openai/gpt-4o");
  });
});
