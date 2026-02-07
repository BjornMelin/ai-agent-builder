import type { ToolExecutionOptions } from "ai";
import { z } from "zod";

import {
  extractWebPage,
  type WebExtractResult,
} from "@/lib/ai/tools/web-extract.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { parseChatToolContext } from "@/workflows/chat/tool-context";

const inputSchema = z.object({
  maxChars: z
    .number()
    .int()
    .min(1)
    .max(budgets.maxWebExtractCharsPerUrl)
    .optional(),
  url: z.string().min(1),
});

/**
 * Web extraction tool step (Firecrawl).
 *
 * @param input - Tool input.
 * @param options - Tool execution options (includes experimental_context).
 * @returns Extracted page content.
 */
export async function webExtractStep(
  input: Readonly<{ url: string; maxChars?: number | undefined }>,
  options: ToolExecutionOptions,
): Promise<WebExtractResult> {
  "use step";

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid web extract input.",
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
      "Missing project context for web extract.",
      error,
    );
  }

  if (ctx.toolBudget.webExtractCalls >= budgets.maxWebExtractCallsPerTurn) {
    throw new AppError(
      "conflict",
      409,
      "Web extract budget exceeded for this turn.",
    );
  }
  ctx.toolBudget.webExtractCalls += 1;

  return extractWebPage({
    maxChars: parsed.data.maxChars,
    url: parsed.data.url,
  });
}
