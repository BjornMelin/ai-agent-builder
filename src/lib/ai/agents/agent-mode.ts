import "server-only";

import { z } from "zod";

import type { ToolId } from "@/lib/ai/tools/tool-ids";

/**
 * Canonical agent mode identifiers.
 */
export const agentModeIdSchema = z.enum([
  "chat-assistant",
  "researcher",
  "architect",
]);

/**
 * Agent mode identifier.
 */
export type AgentModeId = z.infer<typeof agentModeIdSchema>;

/**
 * Per-mode budgets used to configure the agent runtime.
 */
export type AgentModeBudgets = Readonly<{
  /**
   * Maximum number of tool/use steps the agent may take in a single turn.
   */
  maxStepsPerTurn: number;
}>;

/**
 * Feature flags required for a mode to be usable.
 */
export type AgentModeRequirements = Readonly<{
  webResearch: boolean;
  context7: boolean;
}>;

/**
 * Canonical agent mode definition stored in the registry.
 */
export type AgentMode = Readonly<{
  modeId: AgentModeId;
  displayName: string;
  description: string;
  systemPrompt: string;
  /**
   * Default model selection for the mode.
   *
   * @remarks
   * The value must be a Vercel AI Gateway model ID (e.g. `openai/gpt-4.1`,
   * `anthropic/claude-sonnet-4.5`).
   */
  defaultModel: string;
  budgets: AgentModeBudgets;
  allowedTools: readonly ToolId[];
  requirements: AgentModeRequirements;
}>;
