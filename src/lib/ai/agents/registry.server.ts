import "server-only";

import type { AgentMode } from "@/lib/ai/agents/agent-mode";
import {
  DEFAULT_AGENT_MODE_ID,
  getAgentMode,
  listAllAgentModes,
  requestAgentModeIdSchema,
} from "@/lib/ai/agents/registry";
import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";

/**
 * Re-export the default agent mode ID and request agent mode ID schema.
 *
 * @see docs/architecture/spec/SPEC-0006-agent-registry-orchestration-patterns.md
 */
export { DEFAULT_AGENT_MODE_ID, requestAgentModeIdSchema };

function isWebResearchConfigured(): boolean {
  try {
    return Boolean(env.webResearch);
  } catch {
    return false;
  }
}

function isContext7Configured(): boolean {
  try {
    return Boolean(env.context7);
  } catch {
    return false;
  }
}

/**
 * Check whether a mode is enabled in the current environment.
 *
 * @see docs/architecture/spec/SPEC-0006-agent-registry-orchestration-patterns.md
 * @param mode - Mode definition.
 * @returns True when the mode can be used safely.
 */
export function isAgentModeEnabled(mode: AgentMode): boolean {
  const webResearchOk =
    !mode.requirements.webResearch || isWebResearchConfigured();
  const context7Ok = !mode.requirements.context7 || isContext7Configured();
  return webResearchOk && context7Ok;
}

/**
 * List agent modes that are enabled in the current environment.
 *
 * @see docs/architecture/spec/SPEC-0006-agent-registry-orchestration-patterns.md
 * @returns Enabled modes.
 */
export function listEnabledAgentModes(): AgentMode[] {
  return listAllAgentModes().filter(isAgentModeEnabled);
}

/**
 * Resolve and validate an enabled agent mode.
 *
 * @see docs/architecture/spec/SPEC-0006-agent-registry-orchestration-patterns.md
 * @param modeId - Untrusted mode identifier.
 * @returns The resolved agent mode.
 * @throws AppError - With code "bad_request" when modeId is invalid or disabled.
 */
export function getEnabledAgentMode(modeId: string): AgentMode {
  const mode = getAgentMode(modeId);
  if (!isAgentModeEnabled(mode)) {
    throw new AppError("bad_request", 400, "Agent mode is not available.");
  }
  return mode;
}
