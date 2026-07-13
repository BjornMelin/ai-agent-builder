import "server-only";

import type { ToolExecutionOptions, ToolSet } from "ai";

import { getEnabledAgentMode } from "@/lib/ai/agents/registry.server";
import type { ToolId } from "@/lib/ai/tools/tool-ids";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { chatTools } from "@/workflows/chat/tools";

type ChatToolCatalog = typeof chatTools;

type ToolBudget = {
  context7: number;
  webExtract: number;
  webSearch: number;
};

type ToolCost = Readonly<Partial<ToolBudget>>;

type ExecutableTool = ToolSet[string] & {
  execute?: (input: unknown, options: ToolExecutionOptions<unknown>) => unknown;
};

const ZERO_COST: ToolCost = {};

function getToolCost(toolId: ToolId): ToolCost {
  switch (toolId) {
    case "context7.query-docs":
    case "context7.resolve-library-id":
      return { context7: 1 };
    case "research.create-report":
      return {
        webExtract: Math.min(3, budgets.maxWebExtractCallsPerTurn),
        webSearch: 1,
      };
    case "web.extract":
      return { webExtract: 1 };
    case "web.search":
      return { webSearch: 1 };
    default:
      return ZERO_COST;
  }
}

function reserveToolBudget(state: ToolBudget, cost: ToolCost): void {
  const nextContext7 = state.context7 + (cost.context7 ?? 0);
  const nextWebExtract = state.webExtract + (cost.webExtract ?? 0);
  const nextWebSearch = state.webSearch + (cost.webSearch ?? 0);

  if (nextContext7 > budgets.maxContext7CallsPerTurn) {
    throw new AppError(
      "conflict",
      409,
      "Context7 budget exceeded for this turn.",
    );
  }
  if (nextWebExtract > budgets.maxWebExtractCallsPerTurn) {
    throw new AppError(
      "conflict",
      409,
      "Web extract budget exceeded for this turn.",
    );
  }
  if (nextWebSearch > budgets.maxWebSearchCallsPerTurn) {
    throw new AppError(
      "conflict",
      409,
      "Web search budget exceeded for this turn.",
    );
  }

  state.context7 = nextContext7;
  state.webExtract = nextWebExtract;
  state.webSearch = nextWebSearch;
}

function withBudget(
  toolId: ToolId,
  definition: ExecutableTool,
  state: ToolBudget,
): ToolSet[string] {
  const execute = definition.execute;
  const cost = getToolCost(toolId);
  if (!execute || Object.keys(cost).length === 0) return definition;

  return {
    ...definition,
    execute(input: unknown, options: ToolExecutionOptions<unknown>) {
      // This synchronous reservation is the single owner for the current
      // workflow turn. It runs before any tool promise can yield, so parallel
      // calls cannot interleave the check and update.
      reserveToolBudget(state, cost);
      return execute(input, options);
    },
  } as ToolSet[string];
}

function pickAllowedTools(
  catalog: ChatToolCatalog,
  allowedTools: readonly ToolId[],
): ToolSet {
  const out: ToolSet = {};
  const budget: ToolBudget = { context7: 0, webExtract: 0, webSearch: 0 };

  for (const toolId of allowedTools) {
    const definition = catalog[toolId as keyof ChatToolCatalog] as
      | ExecutableTool
      | undefined;
    if (!definition) {
      throw new AppError("bad_request", 400, `Tool not available: ${toolId}.`);
    }
    out[toolId] = withBudget(toolId, definition, budget);
  }

  return out;
}

/**
 * Build a fresh chat toolset for one agent turn.
 *
 * @remarks
 * Budget counters are deliberately scoped to this returned toolset. Construct
 * a new toolset for each `WorkflowAgent.stream()` turn.
 *
 * @param modeId - Agent mode identifier.
 * @returns Toolset filtered by mode allowlist with atomic in-turn budgets.
 */
export function buildChatToolsForMode(modeId: string): ToolSet {
  const mode = getEnabledAgentMode(modeId);
  return pickAllowedTools(chatTools, mode.allowedTools);
}

/**
 * Build immutable per-tool scope for AI SDK 7 context validation.
 *
 * @param toolIds - Tools active for the current agent mode.
 * @param projectId - Project scope.
 * @param modeId - Agent mode scope.
 * @returns Context entries keyed by tool name.
 */
export function buildChatToolsContext(
  toolIds: readonly ToolId[],
  projectId: string,
  modeId: string,
): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  for (const toolId of toolIds) {
    switch (toolId) {
      case "research.create-report":
        context[toolId] = { modeId, projectId };
        break;
      case "retrieveProjectChunks":
      case "skills.load":
      case "skills.readFile":
        context[toolId] = { projectId };
        break;
      default:
        break;
    }
  }
  return context;
}
