import { z } from "zod";

const runKindSchema = z.enum(["research", "implementation"]);
const runStatusSchema = z.enum([
  "pending",
  "running",
  "waiting",
  "blocked",
  "succeeded",
  "failed",
  "canceled",
]);
const runStepKindSchema = z.enum([
  "llm",
  "tool",
  "sandbox",
  "wait",
  "approval",
  "external_poll",
]);

/**
 * Structured events emitted by durable runs via Workflow DevKit streams.
 *
 * @remarks
 * These events are shipped inside `UIMessageChunk` objects (`type: "data-workflow"`)
 * to reuse the AI SDK's streaming response format.
 */
export const runStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    kind: runKindSchema,
    runId: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    type: z.literal("run-started"),
    workflowRunId: z.string().min(1),
  }),
  z.strictObject({
    runId: z.string().min(1),
    stepId: z.string().min(1),
    stepKind: runStepKindSchema,
    stepName: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    type: z.literal("step-started"),
  }),
  z.strictObject({
    error: z.record(z.string(), z.unknown()).nullable().optional(),
    outputs: z.record(z.string(), z.unknown()).optional(),
    runId: z.string().min(1),
    status: runStatusSchema,
    stepId: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    type: z.literal("step-finished"),
  }),
  z.strictObject({
    runId: z.string().min(1),
    status: runStatusSchema,
    timestamp: z.number().int().nonnegative(),
    type: z.literal("run-finished"),
  }),
]);

/** Run stream event type emitted by workflows. */
export type RunStreamEvent = z.infer<typeof runStreamEventSchema>;
