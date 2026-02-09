import { z } from "zod";

const logStreamSchema = z.enum(["stdout", "stderr"]);

/**
 * Structured events emitted by Code Mode workflows.
 *
 * @remarks
 * These events are shipped inside `UIMessageChunk` objects (`type: "data-code-mode"`)
 * to reuse the AI SDK's streaming response format.
 */
export const codeModeStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    message: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    type: z.literal("status"),
  }),
  z.strictObject({
    data: z.string(),
    stream: logStreamSchema,
    timestamp: z.number().int().nonnegative(),
    type: z.literal("log"),
  }),
  z.strictObject({
    textDelta: z.string(),
    timestamp: z.number().int().nonnegative(),
    type: z.literal("assistant-delta"),
  }),
  z.strictObject({
    input: z.unknown().optional(),
    timestamp: z.number().int().nonnegative(),
    toolName: z.string().min(1),
    type: z.literal("tool-call"),
  }),
  z.strictObject({
    output: z.unknown().optional(),
    timestamp: z.number().int().nonnegative(),
    toolName: z.string().min(1),
    type: z.literal("tool-result"),
  }),
  z.strictObject({
    exitCode: z.number().int(),
    timestamp: z.number().int().nonnegative(),
    type: z.literal("exit"),
  }),
]);

/** Code Mode stream event type emitted by workflows. */
export type CodeModeStreamEvent = z.infer<typeof codeModeStreamEventSchema>;
