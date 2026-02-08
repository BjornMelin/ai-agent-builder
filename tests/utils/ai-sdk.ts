import { MockEmbeddingModelV3, MockLanguageModelV3 } from "ai/test";

type LanguageModelV3GenerateResult = Awaited<
  ReturnType<NonNullable<MockLanguageModelV3["doGenerate"]>>
>;

type EmbeddingModelV3EmbedResult = Awaited<
  ReturnType<NonNullable<MockEmbeddingModelV3["doEmbed"]>>
>;

/**
 * Create a deterministic V3 mock language model that always returns `text`.
 *
 * @remarks
 * Prefer using the AI SDK's official mock models (`ai/test`) in unit tests.
 *
 * @param text - The text content to return from `doGenerate`.
 * @returns A `MockLanguageModelV3` configured to return `text`.
 */
export function createMockLanguageModelV3Text(
  text: string,
): MockLanguageModelV3 {
  const result = {
    content: [{ text, type: "text" }],
    finishReason: { raw: undefined, unified: "stop" },
    usage: {
      inputTokens: {
        cacheRead: undefined,
        cacheWrite: undefined,
        noCache: 3,
        total: 3,
      },
      outputTokens: {
        reasoning: undefined,
        text: 10,
        total: 10,
      },
    },
    warnings: [],
  } satisfies LanguageModelV3GenerateResult;

  return new MockLanguageModelV3({
    doGenerate: async () => result,
  });
}

/**
 * Create a deterministic V3 mock embedding model for `embed`/`embedMany` tests.
 *
 * @remarks
 * Defaults to an effectively unlimited `maxEmbeddingsPerCall` so `embedMany`
 * performs a single deterministic call.
 *
 * @param options - Optional overrides for embeddings and model identity.
 * @returns A `MockEmbeddingModelV3` configured for deterministic embeddings.
 */
export function createMockEmbeddingModelV3(
  options?: Readonly<{
    embedForValues?: (values: readonly string[]) => number[][];
    modelId?: string;
  }>,
): MockEmbeddingModelV3 {
  const embedForValues =
    options?.embedForValues ??
    ((values: readonly string[]) =>
      values.map((value, idx) => [value.length, idx]));

  return new MockEmbeddingModelV3({
    // Default to "no limit" so `embedMany` makes a single deterministic call.
    maxEmbeddingsPerCall: null,
    supportsParallelCalls: true,
    ...(options?.modelId ? { modelId: options.modelId } : {}),
    doEmbed: async ({ values }) =>
      ({
        embeddings: embedForValues(values),
        warnings: [],
      }) satisfies EmbeddingModelV3EmbedResult,
  });
}
