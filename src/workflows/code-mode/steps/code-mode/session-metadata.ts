import "server-only";

import { z } from "zod";
import { AppError } from "@/lib/core/errors";

const budgetsSchema = z
  .strictObject({
    maxSteps: z.number().int().min(1).max(50).optional(),
    timeoutMs: z
      .number()
      .int()
      .min(1)
      .max(30 * 60_000)
      .optional(),
  })
  .optional();

export const codeModeMetadataSchema = z.strictObject({
  budgets: budgetsSchema,
  networkAccess: z.enum(["none", "restricted"]).optional(),
  origin: z.literal("code-mode"),
  prompt: z.string().trim().min(1),
});

export type CodeModeMetadata = Readonly<
  z.output<typeof codeModeMetadataSchema>
>;

/**
 * Parse and validate Code Mode metadata stored on the `runs` row.
 *
 * @param metadata - Persisted run metadata (unknown).
 * @returns Parsed metadata.
 * @throws AppError - With code "bad_request" when metadata is missing/invalid.
 */
export function parseCodeModeRunMetadata(metadata: unknown): CodeModeMetadata {
  const parsed = codeModeMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid Code Mode run metadata.",
      parsed.error,
    );
  }

  return parsed.data;
}
