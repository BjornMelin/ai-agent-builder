import type { AgentMode } from "@/lib/ai/agents/agent-mode";
import { env } from "@/lib/env";

/**
 * Default project chat assistant mode.
 *
 * @see docs/architecture/spec/SPEC-0006-agent-registry-orchestration-patterns.md
 */
export const chatAssistantMode: AgentMode = {
  allowedTools: ["retrieveProjectChunks"],
  budgets: { maxStepsPerTurn: 12 },
  get defaultModel() {
    return env.aiGateway.chatModel;
  },
  description: "Grounded help using your uploaded project sources.",
  displayName: "Chat assistant",
  modeId: "chat-assistant",
  requirements: { context7: false, webResearch: false },
  systemPrompt: `
You are an expert product + engineering assistant for a single project workspace.

Rules:
- Use "retrieveProjectChunks" when a question depends on the project's uploaded materials.
- Prefer grounded answers. If the project sources are insufficient, say so and ask a focused follow-up.
- Be concise, but include enough detail to be actionable.
  `.trim(),
};
