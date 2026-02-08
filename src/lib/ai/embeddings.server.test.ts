import { createMockEmbeddingModelV3 } from "@tests/utils/ai-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getAiGatewayProvider: vi.fn(),
  getDefaultEmbeddingModel: vi.fn(),
  provider: {
    embeddingModel: vi.fn(),
  },
}));

vi.mock("@/lib/ai/gateway.server", () => ({
  getAiGatewayProvider: state.getAiGatewayProvider,
  getDefaultEmbeddingModel: state.getDefaultEmbeddingModel,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.getAiGatewayProvider.mockReturnValue(state.provider);
});

describe("embeddings helpers", () => {
  it("embedText uses the default embedding model by default", async () => {
    const defaultModel = createMockEmbeddingModelV3();
    state.getDefaultEmbeddingModel.mockReturnValue(defaultModel);

    const { embedText } = await import("@/lib/ai/embeddings.server");
    const res = await embedText("hello");

    expect(res).toEqual([5, 0]);
    expect(state.getDefaultEmbeddingModel).toHaveBeenCalledTimes(1);
    expect(defaultModel.doEmbedCalls).toHaveLength(1);
    expect(defaultModel.doEmbedCalls[0]).toMatchObject({
      values: ["hello"],
    });
  });

  it("embedText uses an explicit model override when provided", async () => {
    const defaultModel = createMockEmbeddingModelV3();
    const overrideModel = createMockEmbeddingModelV3({
      embedForValues: (values) => values.map((v, idx) => [v.length + 100, idx]),
      modelId: "override-model",
    });

    state.getDefaultEmbeddingModel.mockReturnValue(defaultModel);
    state.provider.embeddingModel.mockReturnValue(overrideModel);

    const { embedText } = await import("@/lib/ai/embeddings.server");
    const res = await embedText("hello", {
      modelId: "openai/text-embedding-3-small",
    });

    expect(res).toEqual([105, 0]);
    expect(state.provider.embeddingModel).toHaveBeenCalledWith(
      "openai/text-embedding-3-small",
    );
    expect(defaultModel.doEmbedCalls).toHaveLength(0);
    expect(overrideModel.doEmbedCalls).toHaveLength(1);
    expect(overrideModel.doEmbedCalls[0]).toMatchObject({
      values: ["hello"],
    });
  });

  it("embedTexts returns [] for empty inputs and does not call the model", async () => {
    const defaultModel = createMockEmbeddingModelV3();
    state.getDefaultEmbeddingModel.mockReturnValue(defaultModel);

    const { embedTexts } = await import("@/lib/ai/embeddings.server");
    const res = await embedTexts([]);

    expect(res).toEqual([]);
    expect(defaultModel.doEmbedCalls).toHaveLength(0);
  });

  it("embedTexts embeds all values in input order", async () => {
    const defaultModel = createMockEmbeddingModelV3();
    state.getDefaultEmbeddingModel.mockReturnValue(defaultModel);

    const { embedTexts } = await import("@/lib/ai/embeddings.server");
    const res = await embedTexts(["a", "bb"]);

    expect(res).toEqual([
      [1, 0],
      [2, 1],
    ]);
    expect(defaultModel.doEmbedCalls).toHaveLength(1);
    expect(defaultModel.doEmbedCalls[0]).toMatchObject({
      values: ["a", "bb"],
    });
  });

  it("embedTexts remains deterministic with maxParallelCalls override", async () => {
    const defaultModel = createMockEmbeddingModelV3();
    state.getDefaultEmbeddingModel.mockReturnValue(defaultModel);

    const { embedTexts } = await import("@/lib/ai/embeddings.server");
    const res = await embedTexts(["a", "b"], { maxParallelCalls: 7 });

    expect(res).toEqual([
      [1, 0],
      [1, 1],
    ]);
    expect(defaultModel.doEmbedCalls).toHaveLength(1);
    expect(defaultModel.doEmbedCalls[0]).toMatchObject({
      values: ["a", "b"],
    });
  });
});
