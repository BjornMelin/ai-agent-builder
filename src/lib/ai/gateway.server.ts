import "server-only";

import { createGateway, type GatewayModelId } from "ai";

import { env } from "@/lib/env";

let cachedGatewayProvider: ReturnType<typeof createGateway> | undefined;

type GatewayEmbeddingModelId = Parameters<
  ReturnType<typeof createGateway>["embeddingModel"]
>[0];

/**
 * Get the configured Vercel AI Gateway provider.
 *
 * This is the canonical way to access AI Gateway in the app. It ensures:
 * - no direct `process.env` access (env is feature-gated via `@/lib/env`)
 * - model routing is centralized (see ADR-0007)
 *
 * @returns AI Gateway provider instance.
 */
export function getAiGatewayProvider(): ReturnType<typeof createGateway> {
  cachedGatewayProvider ??= createGateway({
    apiKey: env.aiGateway.apiKey,
    // AI SDK Gateway provider expects the gateway base URL (default:
    // https://ai-gateway.vercel.sh/v3/ai).
    baseURL: env.aiGateway.baseUrl,
  });

  return cachedGatewayProvider;
}

/**
 * Get the default chat generation model for the app.
 *
 * This is config-driven via `AI_GATEWAY_CHAT_MODEL` (see env contract).
 *
 * @returns AI Gateway language model.
 */
export function getDefaultChatModel() {
  const provider = getAiGatewayProvider();
  return provider.languageModel(env.aiGateway.chatModel as GatewayModelId);
}

/**
 * Get the default embedding model for the app.
 *
 * This is config-driven via `AI_GATEWAY_EMBEDDING_MODEL` (see env contract).
 *
 * @returns AI Gateway embedding model.
 */
export function getDefaultEmbeddingModel() {
  const provider = getAiGatewayProvider();
  return provider.embeddingModel(
    env.aiGateway.embeddingModel as GatewayEmbeddingModelId,
  );
}
