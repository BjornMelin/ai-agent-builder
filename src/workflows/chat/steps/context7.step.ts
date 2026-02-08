import type { ToolExecutionOptions } from "ai";
import { z } from "zod";

import {
  context7QueryDocs,
  context7ResolveLibraryId,
} from "@/lib/ai/tools/mcp-context7.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { parseChatToolContext } from "@/workflows/chat/tool-context";

const resolveSchema = z.object({
  libraryName: z.string().min(1),
  query: z.string().min(1),
});

const querySchema = z.object({
  libraryId: z.string().min(1),
  query: z.string().min(1),
});

function assertContext7Budget(
  options: ToolExecutionOptions,
): ReturnType<typeof parseChatToolContext> {
  let ctx: ReturnType<typeof parseChatToolContext>;
  try {
    ctx = parseChatToolContext(options.experimental_context);
  } catch (error) {
    throw new AppError(
      "bad_request",
      400,
      "Missing project context for Context7.",
      error,
    );
  }

  if (ctx.toolBudget.context7Calls >= budgets.maxContext7CallsPerTurn) {
    throw new AppError(
      "conflict",
      409,
      "Context7 budget exceeded for this turn.",
    );
  }
  ctx.toolBudget.context7Calls += 1;
  return ctx;
}

/**
 * Context7 MCP: resolve a library name to a library id.
 *
 * @remarks
 * ADR-0012 documents the Context7 MCP tool exposure and budgets.
 *
 * @param input - Tool input.
 * @param options - Tool execution options.
 * @returns Context7 response.
 * @throws AppError - When input is invalid, project context is missing, or the per-turn budget is exceeded.
 */
export async function context7ResolveLibraryIdStep(
  input: Readonly<{ libraryName: string; query: string }>,
  options: ToolExecutionOptions,
): Promise<unknown> {
  "use step";

  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid Context7 resolve input.",
      parsed.error,
    );
  }

  assertContext7Budget(options);
  return context7ResolveLibraryId(parsed.data, {
    abortSignal: options.abortSignal,
  });
}

/**
 * Context7 MCP: query docs for a library id.
 *
 * @remarks
 * ADR-0012 documents the Context7 MCP tool exposure and budgets.
 *
 * @param input - Tool input.
 * @param options - Tool execution options.
 * @returns Context7 response.
 * @throws AppError - When input is invalid, project context is missing, or the per-turn budget is exceeded.
 */
export async function context7QueryDocsStep(
  input: Readonly<{ libraryId: string; query: string }>,
  options: ToolExecutionOptions,
): Promise<unknown> {
  "use step";

  const parsed = querySchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid Context7 query input.",
      parsed.error,
    );
  }

  assertContext7Budget(options);
  return context7QueryDocs(parsed.data, { abortSignal: options.abortSignal });
}
