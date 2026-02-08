import { createMockLanguageModelV3Text } from "@tests/utils/ai-sdk";
import { MockProviderV3 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  createGateway: vi.fn(),
  env: {
    aiGateway: {
      apiKey: "gw-key",
      baseUrl: "https://ai-gateway.vercel.sh/v3/ai",
      chatModel: "openai/gpt-4o",
    },
  },
}));

vi.mock("ai", () => ({
  createGateway: state.createGateway,
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

let chatModel: ReturnType<typeof createMockLanguageModelV3Text>;
let provider: MockProviderV3;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  chatModel = createMockLanguageModelV3Text("hi");
  provider = new MockProviderV3({
    languageModels: {
      "openai/gpt-4o": chatModel,
    },
  });

  state.createGateway.mockReturnValue(provider);
});

describe("workflow gateway models", () => {
  it("constructs a provider using env baseURL and apiKey", async () => {
    const mod = await import("@/workflows/ai/gateway-models.step");
    const model = await mod.getWorkflowChatModel("openai/gpt-4o");

    expect(state.createGateway).toHaveBeenCalledWith({
      apiKey: "gw-key",
      baseURL: "https://ai-gateway.vercel.sh/v3/ai",
    });
    expect(model).toBe(chatModel);
  });

  it("rejects invalid model ids", async () => {
    const mod = await import("@/workflows/ai/gateway-models.step");
    await expect(mod.getWorkflowChatModel("bad")).rejects.toMatchObject({
      code: "env_invalid",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("resolves the default chat model from env", async () => {
    const mod = await import("@/workflows/ai/gateway-models.step");
    const model = await mod.getWorkflowDefaultChatModel();

    expect(model).toBe(chatModel);
  });
});
