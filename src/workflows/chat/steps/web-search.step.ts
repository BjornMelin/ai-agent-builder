import type { ToolExecutionOptions } from "ai";
import { z } from "zod";

import {
  searchWeb,
  type WebSearchResponse,
} from "@/lib/ai/tools/web-search.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { parseChatToolContext } from "@/workflows/chat/tool-context";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const inputSchema = z.object({
  endPublishedDate: z.string().regex(ISO_DATE_PATTERN).optional(),
  excludeDomains: z.array(z.string().min(1)).max(20).optional(),
  includeDomains: z.array(z.string().min(1)).max(20).optional(),
  numResults: z
    .number()
    .int()
    .min(1)
    .max(budgets.maxWebSearchResults)
    .optional(),
  query: z.string().min(1),
  startPublishedDate: z.string().regex(ISO_DATE_PATTERN).optional(),
});

/**
 * Web search tool step (Exa).
 *
 * @param input - Tool input.
 * @param options - Tool execution options (includes experimental_context).
 * @returns Web search response.
 */
export async function webSearchStep(
  input: Readonly<{
    query: string;
    numResults?: number | undefined;
    includeDomains?: readonly string[] | undefined;
    excludeDomains?: readonly string[] | undefined;
    startPublishedDate?: string | undefined;
    endPublishedDate?: string | undefined;
  }>,
  options: ToolExecutionOptions,
): Promise<WebSearchResponse> {
  "use step";

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid web search input.",
      parsed.error,
    );
  }

  let ctx: ReturnType<typeof parseChatToolContext>;
  try {
    ctx = parseChatToolContext(options.experimental_context);
  } catch (error) {
    throw new AppError(
      "bad_request",
      400,
      "Missing project context for web search.",
      error,
    );
  }

  if (ctx.toolBudget.webSearchCalls >= budgets.maxWebSearchCallsPerTurn) {
    throw new AppError(
      "conflict",
      409,
      "Web search budget exceeded for this turn.",
    );
  }
  ctx.toolBudget.webSearchCalls += 1;

  return searchWeb({
    endPublishedDate: parsed.data.endPublishedDate,
    excludeDomains: parsed.data.excludeDomains,
    includeDomains: parsed.data.includeDomains,
    numResults: parsed.data.numResults,
    query: parsed.data.query,
    startPublishedDate: parsed.data.startPublishedDate,
  });
}
