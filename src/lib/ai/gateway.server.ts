import "server-only";

import { createGateway, type GatewayModelId } from "ai";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";

let cachedGatewayProvider: ReturnType<typeof createGateway> | undefined;

type GatewayEmbeddingModelId = Parameters<
  ReturnType<typeof createGateway>["embeddingModel"]
>[0];

const gatewayModelIdPattern = /^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/i;

function assertGatewayModelId(
  value: string,
  kind: "chat" | "embedding",
): string {
  if (!gatewayModelIdPattern.test(value)) {
    throw new AppError(
      "env_invalid",
      500,
      `Invalid AI Gateway ${kind} model id: ${value}.`,
    );
  }
  return value;
}

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
  const modelId = assertGatewayModelId(env.aiGateway.chatModel, "chat");
  return provider.languageModel(modelId as GatewayModelId);
}

/**
 * Get a chat generation model by explicit AI Gateway model id.
 *
 * @param modelId - AI Gateway model id.
 * @returns AI Gateway language model.
 */
export function getChatModelById(modelId: string) {
  const provider = getAiGatewayProvider();
  const validated = assertGatewayModelId(modelId, "chat");
  return provider.languageModel(validated as GatewayModelId);
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
  const modelId = assertGatewayModelId(
    env.aiGateway.embeddingModel,
    "embedding",
  );
  return provider.embeddingModel(modelId as GatewayEmbeddingModelId);
}
