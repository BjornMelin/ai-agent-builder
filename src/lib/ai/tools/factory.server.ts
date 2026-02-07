import "server-only";

import type { ToolSet } from "ai";

import { getAgentMode } from "@/lib/ai/agents/registry";
import type { ToolId } from "@/lib/ai/tools/tool-ids";
import { AppError } from "@/lib/core/errors";
import { chatTools } from "@/workflows/chat/tools";

type ChatToolCatalog = typeof chatTools;

function pickAllowedTools(
  catalog: ChatToolCatalog,
  allowedTools: readonly ToolId[],
): ToolSet {
  const out: ToolSet = {};

  for (const toolId of allowedTools) {
    const tool = catalog[toolId as keyof ChatToolCatalog] as unknown;
    if (!tool) {
      throw new AppError("bad_request", 400, `Tool not available: ${toolId}.`);
    }
    out[toolId] = tool as ToolSet[string];
  }

  return out;
}

/**
 * Build the chat toolset for a specific agent mode.
 *
 * @param modeId - Agent mode identifier.
 * @returns Toolset filtered by mode allowlist.
 */
export function buildChatToolsForMode(modeId: string): ToolSet {
  const mode = getAgentMode(modeId);
  return pickAllowedTools(chatTools, mode.allowedTools);
}
