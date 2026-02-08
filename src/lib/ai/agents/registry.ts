import "server-only";

import { z } from "zod";

import {
  type AgentMode,
  type AgentModeId,
  agentModeIdSchema,
} from "@/lib/ai/agents/agent-mode";
import { architectMode } from "@/lib/ai/agents/modes/architect";
import { chatAssistantMode } from "@/lib/ai/agents/modes/chat-assistant";
import { researcherMode } from "@/lib/ai/agents/modes/researcher";
import { AppError } from "@/lib/core/errors";

/**
 * Default agent mode used when a thread does not specify one (legacy rows).
 *
 * @see docs/architecture/spec/SPEC-0006-agent-registry-orchestration-patterns.md
 */
export const DEFAULT_AGENT_MODE_ID: AgentModeId = "chat-assistant";

const agentModesRegistry = {
  architect: architectMode,
  "chat-assistant": chatAssistantMode,
  researcher: researcherMode,
} as const satisfies Record<AgentModeId, AgentMode>;

/**
 * List all known agent modes.
 *
 * @see docs/architecture/spec/SPEC-0006-agent-registry-orchestration-patterns.md
 * @returns All modes.
 */
export function listAllAgentModes(): AgentMode[] {
  return Object.values(agentModesRegistry);
}

/**
 * Resolve and validate an agent mode.
 *
 * @see docs/architecture/spec/SPEC-0006-agent-registry-orchestration-patterns.md
 * @param modeId - Untrusted mode identifier.
 * @returns The resolved agent mode.
 * @throws AppError - With code "bad_request" when modeId is invalid.
 */
export function getAgentMode(modeId: string): AgentMode {
  const parsed = agentModeIdSchema.safeParse(modeId);
  if (!parsed.success) {
    throw new AppError("bad_request", 400, "Invalid agent mode.");
  }

  return agentModesRegistry[parsed.data];
}

/**
 * Schema for request payloads that accept an optional mode id.
 *
 * Defaults to {@link DEFAULT_AGENT_MODE_ID} then validates via {@link agentModeIdSchema}.
 *
 * @see docs/architecture/spec/SPEC-0006-agent-registry-orchestration-patterns.md
 */
export const requestAgentModeIdSchema = z
  .string()
  .min(1)
  .prefault(DEFAULT_AGENT_MODE_ID)
  .pipe(agentModeIdSchema);
