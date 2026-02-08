import {
  createMockEmbeddingModelV3,
  createMockLanguageModelV3Text,
} from "@tests/utils/ai-sdk";
import { MockProviderV3 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  createGateway: vi.fn(),
  env: {
    aiGateway: {
      apiKey: "gw-test-key",
      baseUrl: "https://ai-gateway.vercel.sh/v3/ai",
      chatModel: "openai/gpt-4o",
      embeddingModel: "openai/text-embedding-3-large",
    },
  },
}));

vi.mock("ai", async () => {
  return {
    createGateway: state.createGateway,
  };
});

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

let provider: MockProviderV3;
let chatModel: ReturnType<typeof createMockLanguageModelV3Text>;
let embeddingModel: ReturnType<typeof createMockEmbeddingModelV3>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  chatModel = createMockLanguageModelV3Text("hi");
  embeddingModel = createMockEmbeddingModelV3({
    modelId: state.env.aiGateway.embeddingModel,
  });
  provider = new MockProviderV3({
    embeddingModels: {
      [state.env.aiGateway.embeddingModel]: embeddingModel,
    },
    languageModels: {
      [state.env.aiGateway.chatModel]: chatModel,
    },
  });

  state.createGateway.mockReturnValue(provider);
});

describe("AI gateway helpers", () => {
  it("memoizes the gateway provider", async () => {
    const mod = await import("@/lib/ai/gateway.server");

    const p1 = mod.getAiGatewayProvider();
    const p2 = mod.getAiGatewayProvider();

    expect(p1).toBe(p2);
    expect(p1).toBe(provider);
    expect(state.createGateway).toHaveBeenCalledTimes(1);
    expect(state.createGateway).toHaveBeenCalledWith({
      apiKey: "gw-test-key",
      baseURL: "https://ai-gateway.vercel.sh/v3/ai",
    });
  });

  it("returns the default chat model configured by env", async () => {
    const mod = await import("@/lib/ai/gateway.server");
    const model = mod.getDefaultChatModel();

    expect(model).toBe(chatModel);
  });

  it("rejects invalid chat model ids", async () => {
    const mod = await import("@/lib/ai/gateway.server");

    try {
      mod.getChatModelById("not-a-model-id");
      throw new Error("Expected getChatModelById() to throw.");
    } catch (err) {
      expect(err).toMatchObject({
        code: "env_invalid",
        status: 500,
      } satisfies Partial<AppError>);
    }
  });

  it("returns the default embedding model configured by env", async () => {
    const mod = await import("@/lib/ai/gateway.server");
    const model = mod.getDefaultEmbeddingModel();

    expect(model).toBe(embeddingModel);
  });
});
