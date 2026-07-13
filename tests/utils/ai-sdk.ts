import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockEmbeddingModelV4, MockLanguageModelV4 } from "ai/test";

type LanguageModelV4GenerateResult = Awaited<
  ReturnType<MockLanguageModelV4["doGenerate"]>
>;

type EmbeddingModelV4EmbedResult = Awaited<
  ReturnType<MockEmbeddingModelV4["doEmbed"]>
>;

/**
 * Create a deterministic V4 mock language model that always returns `text`.
 *
 * @remarks
 * Prefer using the AI SDK's official mock models (`ai/test`) in unit tests.
 *
 * @param text - The text content to return from `doGenerate`.
 * @returns A `MockLanguageModelV4` configured to return `text`.
 */
export function createMockLanguageModelV4Text(
  text: string,
): MockLanguageModelV4 {
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
  } satisfies LanguageModelV4GenerateResult;

  return new MockLanguageModelV4({
    doGenerate: async () => result,
  });
}

/**
 * Create a deterministic V4 mock language model that streams text parts.
 *
 * @remarks
 * Prefer `simulateReadableStream` over hand-rolled async iterators so tests
 * match the AI SDK's streaming shape.
 *
 * @param chunks - Stream parts emitted by the model.
 * @returns A `MockLanguageModelV4` configured to stream `chunks`.
 */
export function createMockLanguageModelV4StreamText(
  chunks: readonly LanguageModelV4StreamPart[],
): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        // Emit without delays to keep tests fast/deterministic.
        chunkDelayInMs: null,
        chunks: Array.from(chunks),
        initialDelayInMs: null,
      }),
    }),
  });
}

/**
 * Create a deterministic V4 mock embedding model for `embed`/`embedMany` tests.
 *
 * @remarks
 * Defaults to an effectively unlimited `maxEmbeddingsPerCall` so `embedMany`
 * performs a single deterministic call.
 *
 * @param options - Optional overrides for embeddings and model identity.
 * @returns A `MockEmbeddingModelV4` configured for deterministic embeddings.
 */
export function createMockEmbeddingModelV4(
  options?: Readonly<{
    embedForValues?: (values: readonly string[]) => number[][];
    modelId?: string;
  }>,
): MockEmbeddingModelV4 {
  const embedForValues =
    options?.embedForValues ??
    ((values: readonly string[]) =>
      values.map((value, idx) => [value.length, idx]));

  return new MockEmbeddingModelV4({
    // Default to "no limit" so `embedMany` makes a single deterministic call.
    maxEmbeddingsPerCall: null,
    supportsParallelCalls: true,
    ...(options?.modelId ? { modelId: options.modelId } : {}),
    doEmbed: async ({ values }) =>
      ({
        embeddings: embedForValues(values),
        warnings: [],
      }) satisfies EmbeddingModelV4EmbedResult,
  });
}
