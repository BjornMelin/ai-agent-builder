import type { ToolExecutionOptions } from "ai";
import { z } from "zod";

import {
  extractWebPage,
  type WebExtractResult,
} from "@/lib/ai/tools/web-extract.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";

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
 * @remarks
 * SPEC-0007 defines Firecrawl integration with SSRF validation and caching.
 *
 * @param input - Tool input.
 * @param options - Tool execution options.
 * @returns Extracted page content.
 * @throws AppError - With code "bad_request" (400) for invalid input.
 */
export async function webExtractStep(
  input: Readonly<{ url: string; maxChars?: number | undefined }>,
  options: ToolExecutionOptions<undefined>,
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

  return extractWebPage({
    abortSignal: options.abortSignal,
    maxChars: parsed.data.maxChars,
    url: parsed.data.url,
  });
}
