import type { CompatibleLanguageModel } from "@workflow/ai/agent";
import { createGateway, type GatewayModelId } from "ai";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";

const gatewayModelIdPattern = /^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/i;

function assertGatewayChatModelId(value: string): string {
  if (!gatewayModelIdPattern.test(value)) {
    throw new AppError(
      "env_invalid",
      500,
      `Invalid AI Gateway chat model id: ${value}.`,
    );
  }
  return value;
}

/**
 * Resolve a chat model for Workflow DevKit steps.
 *
 * @remarks
 * Workflow DevKit supports `model: string` model IDs, but that uses the default
 * AI Gateway base URL. This helper centralizes model construction so it
 * respects our env contract (`AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`).
 *
 * @param modelId - AI Gateway model ID (e.g. `openai/gpt-4.1`).
 * @returns A Vercel AI Gateway language model instance.
 */
export async function getWorkflowChatModel(
  modelId: string,
): Promise<CompatibleLanguageModel> {
  "use step";

  const provider = createGateway({
    apiKey: env.aiGateway.apiKey,
    baseURL: env.aiGateway.baseUrl,
  });

  // Workflow DevKit expects a model compatible with AI SDK v5/v6 (V2 or V3).
  // We cast because the AI Gateway provider returns a V3 model, and DevKit
  // invokes it with V2-style call options (structurally compatible at runtime).
  return provider.languageModel(
    assertGatewayChatModelId(modelId) as GatewayModelId,
  ) as unknown as CompatibleLanguageModel;
}

/**
 * Resolve the default chat model for Workflow DevKit steps.
 *
 * @remarks
 * `@workflow/ai` supports `model: string` (AI Gateway model ID), but that path
 * uses the default AI Gateway base URL. We centralize model construction so it
 * respects our env contract (`AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`,
 * `AI_GATEWAY_CHAT_MODEL`).
 *
 * @returns A Vercel AI Gateway language model instance.
 */
export async function getWorkflowDefaultChatModel(): Promise<CompatibleLanguageModel> {
  "use step";

  return getWorkflowChatModel(env.aiGateway.chatModel);
}
