import { z } from "zod";

/**
 * Mutable per-turn budget counters passed via `experimental_context`.
 */
export type CodeModeToolBudget = {
  execCalls: number;
  readCalls: number;
};

/**
 * Context object passed to tools via `experimental_context`.
 */
export type CodeModeToolContext = {
  projectId: string;
  runId: string;
  sandboxId: string;
  sessionId: string;
  toolBudget: CodeModeToolBudget;
};

const toolBudgetSchema = z.object({
  execCalls: z.number().int().min(0).default(0),
  readCalls: z.number().int().min(0).default(0),
});

const toolContextSchema = z.object({
  projectId: z.string().min(1),
  runId: z.string().min(1),
  sandboxId: z.string().min(1),
  sessionId: z.string().min(1),
  toolBudget: toolBudgetSchema.default({ execCalls: 0, readCalls: 0 }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Create a fresh Code Mode tool context for an agent turn.
 *
 * @param input - Context identity values.
 * @returns Tool context object.
 */
export function createCodeModeToolContext(
  input: Readonly<{
    projectId: string;
    runId: string;
    sandboxId: string;
    sessionId: string;
  }>,
): CodeModeToolContext {
  return {
    projectId: input.projectId,
    runId: input.runId,
    sandboxId: input.sandboxId,
    sessionId: input.sessionId,
    toolBudget: { execCalls: 0, readCalls: 0 },
  };
}

/**
 * Parse `experimental_context` into a typed Code Mode tool context.
 *
 * @param value - Untrusted context value.
 * @returns Parsed tool context.
 * @throws Error - When the context is missing or malformed.
 */
export function parseCodeModeToolContext(value: unknown): CodeModeToolContext {
  const parsed = toolContextSchema.safeParse(value);
  if (parsed.success) {
    // Preserve original reference so tools can mutate per-turn budgets.
    if (isRecord(value)) {
      value.projectId = parsed.data.projectId;
      value.runId = parsed.data.runId;
      value.sandboxId = parsed.data.sandboxId;
      value.sessionId = parsed.data.sessionId;

      const budgetValue = value.toolBudget;
      if (isRecord(budgetValue)) {
        budgetValue.execCalls = parsed.data.toolBudget.execCalls;
        budgetValue.readCalls = parsed.data.toolBudget.readCalls;
      } else {
        value.toolBudget = { ...parsed.data.toolBudget };
      }

      return value as CodeModeToolContext;
    }

    return parsed.data;
  }

  throw new Error("Missing Code Mode context for tool execution.");
}
