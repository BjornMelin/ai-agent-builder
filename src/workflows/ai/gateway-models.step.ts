import type { CompatibleLanguageModel } from "@workflow/ai/agent";
import { createGateway, type GatewayModelId } from "ai";

import { env } from "@/lib/env";

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

  const provider = createGateway({
    apiKey: env.aiGateway.apiKey,
    baseURL: env.aiGateway.baseUrl,
  });

  // Workflow DevKit expects a model compatible with AI SDK v5/v6 (V2 or V3).
  // We cast because the AI Gateway provider returns a V3 model, and DevKit
  // invokes it with V2-style call options (structurally compatible at runtime).
  return provider.languageModel(
    env.aiGateway.chatModel as GatewayModelId,
  ) as unknown as CompatibleLanguageModel;
}
