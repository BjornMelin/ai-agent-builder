import { z } from "zod";

/**
 * Mutable tool budget counters passed via `experimental_context`.
 *
 * @remarks
 * These counters are per-agent-turn. The workflow creates a fresh context for
 * each `agent.stream()` call.
 */
export type ChatToolBudget = {
  context7Calls: number;
  webExtractCalls: number;
  webSearchCalls: number;
};

export type ChatToolContext = {
  projectId: string;
  toolBudget: ChatToolBudget;
};

const toolBudgetSchema = z.object({
  context7Calls: z.number().int().min(0).default(0),
  webExtractCalls: z.number().int().min(0).default(0),
  webSearchCalls: z.number().int().min(0).default(0),
});

const toolContextSchema = z.object({
  projectId: z.string().min(1),
  toolBudget: toolBudgetSchema,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Create a fresh tool context for an agent turn.
 *
 * @param projectId - Project identifier.
 * @returns Tool context object.
 */
export function createChatToolContext(projectId: string): ChatToolContext {
  return {
    projectId,
    toolBudget: { context7Calls: 0, webExtractCalls: 0, webSearchCalls: 0 },
  };
}

/**
 * Parse `experimental_context` into a typed tool context.
 *
 * @param value - Untrusted context value.
 * @returns Parsed tool context.
 */
export function parseChatToolContext(value: unknown): ChatToolContext {
  const parsed = toolContextSchema.safeParse(value);
  if (parsed.success) {
    // Zod returns a new object; we need to preserve the original reference so
    // tools can mutate per-turn budgets via `experimental_context`.
    if (isRecord(value)) {
      value.projectId = parsed.data.projectId;

      const budgetValue = value.toolBudget;
      if (isRecord(budgetValue)) {
        budgetValue.context7Calls = parsed.data.toolBudget.context7Calls;
        budgetValue.webExtractCalls = parsed.data.toolBudget.webExtractCalls;
        budgetValue.webSearchCalls = parsed.data.toolBudget.webSearchCalls;
      } else {
        value.toolBudget = { ...parsed.data.toolBudget };
      }

      return value as ChatToolContext;
    }

    return parsed.data;
  }

  // Backward-compatible fallback for older tool implementations that only
  // provided `{ projectId }` context.
  const legacy = z.object({ projectId: z.string().min(1) }).safeParse(value);

  if (legacy.success) {
    // Preserve object identity so budgets can still be enforced if the caller
    // passed a mutable context object.
    if (isRecord(value)) {
      value.projectId = legacy.data.projectId;
      value.toolBudget = {
        context7Calls: 0,
        webExtractCalls: 0,
        webSearchCalls: 0,
      };
      return value as ChatToolContext;
    }

    return createChatToolContext(legacy.data.projectId);
  }

  throw new Error("Missing project context for tool execution.");
}
