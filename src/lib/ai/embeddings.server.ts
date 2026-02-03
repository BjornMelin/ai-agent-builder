import "server-only";

import { embed, embedMany } from "ai";

import {
  getAiGatewayProvider,
  getDefaultEmbeddingModel,
} from "@/lib/ai/gateway.server";

type GatewayEmbeddingModelId = Parameters<
  ReturnType<typeof getAiGatewayProvider>["embeddingModel"]
>[0];

/**
 * Embed a single string using Vercel AI Gateway.
 *
 * @param input - Text to embed.
 * @param options - Optional overrides.
 * @returns Dense embedding vector.
 */
export async function embedText(
  input: string,
  options?: Readonly<{ modelId?: GatewayEmbeddingModelId }>,
): Promise<number[]> {
  const model = options?.modelId
    ? getAiGatewayProvider().embeddingModel(options.modelId)
    : getDefaultEmbeddingModel();

  const result = await embed({ model, value: input });
  return result.embedding;
}

/**
 * Embed many strings using Vercel AI Gateway.
 *
 * Use this for ingestion to reduce request overhead vs embedding one-by-one.
 *
 * @param inputs - Texts to embed.
 * @param options - Optional overrides.
 * @returns Dense embedding vectors aligned with `inputs`.
 */
export async function embedTexts(
  inputs: readonly string[],
  options?: Readonly<{
    modelId?: GatewayEmbeddingModelId;
    maxParallelCalls?: number;
  }>,
): Promise<readonly number[][]> {
  const model = options?.modelId
    ? getAiGatewayProvider().embeddingModel(options.modelId)
    : getDefaultEmbeddingModel();

  const result = await embedMany({
    maxParallelCalls: options?.maxParallelCalls ?? 2,
    model,
    values: [...inputs],
  });

  return result.embeddings;
}
