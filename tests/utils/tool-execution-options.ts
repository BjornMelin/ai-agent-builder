import type { ToolExecutionOptions } from "ai";

/**
 * Minimal `ToolExecutionOptions` builder for workflow tool step tests.
 *
 * @remarks
 * Workflow steps only read a small subset of the full options object, so tests
 * should construct the smallest shape that satisfies those access patterns.
 *
 * @param input - Context and optional signal/toolCallId overrides.
 * @returns A minimal `ToolExecutionOptions` object for step execution.
 */
export function makeToolOptions(
  input: Readonly<{
    ctx: unknown;
    signal?: AbortSignal;
    toolCallId?: string;
  }>,
): ToolExecutionOptions {
  return {
    abortSignal: input.signal,
    experimental_context: input.ctx,
    messages: [],
    toolCallId: input.toolCallId ?? "test",
  } as unknown as ToolExecutionOptions;
}
