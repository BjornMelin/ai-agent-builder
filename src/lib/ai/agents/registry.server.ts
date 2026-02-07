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

/** Export default agent mode ID and request agent mode ID schema. */
export { DEFAULT_AGENT_MODE_ID, requestAgentModeIdSchema };

function isWebResearchConfigured(): boolean {
  try {
    env.webResearch;
    return true;
  } catch {
    return false;
  }
}

function isContext7Configured(): boolean {
  try {
    env.context7;
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a mode is enabled in the current environment.
 *
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
 * @returns Enabled modes.
 */
export function listEnabledAgentModes(): AgentMode[] {
  return listAllAgentModes().filter(isAgentModeEnabled);
}

/**
 * Resolve and validate an enabled agent mode.
 *
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
