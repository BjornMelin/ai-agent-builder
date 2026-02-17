import { z } from "zod";

/** Current schema version for workflow stream payloads. */
export const WORKFLOW_STREAM_SCHEMA_VERSION = 2 as const;

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
const logStreamSchema = z.enum(["stdout", "stderr"]);
const workflowStreamVersionSchema = z.literal(WORKFLOW_STREAM_SCHEMA_VERSION);

const filePartSchema = z.strictObject({
  filename: z.string().min(1).optional(),
  mediaType: z.string().min(1),
  type: z.literal("file"),
  url: z.string().min(1),
});

/**
 * Structured run events emitted by durable run workflows.
 */
export const runStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    domain: z.literal("run"),
    kind: runKindSchema,
    runId: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    type: z.literal("run-started"),
    version: workflowStreamVersionSchema,
    workflowRunId: z.string().min(1),
  }),
  z.strictObject({
    domain: z.literal("run"),
    runId: z.string().min(1),
    stepId: z.string().min(1),
    stepKind: runStepKindSchema,
    stepName: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    type: z.literal("step-started"),
    version: workflowStreamVersionSchema,
  }),
  z.strictObject({
    domain: z.literal("run"),
    error: z.record(z.string(), z.unknown()).nullish(),
    outputs: z.record(z.string(), z.unknown()).optional(),
    runId: z.string().min(1),
    status: runStatusSchema,
    stepId: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    type: z.literal("step-finished"),
    version: workflowStreamVersionSchema,
  }),
  z.strictObject({
    domain: z.literal("run"),
    runId: z.string().min(1),
    status: runStatusSchema,
    timestamp: z.number().int().nonnegative(),
    type: z.literal("run-finished"),
    version: workflowStreamVersionSchema,
  }),
]);

/**
 * Marker events emitted by multi-turn chat workflows for user messages.
 */
export const chatUserMessageMarkerSchema = z.strictObject({
  content: z.string(),
  domain: z.literal("chat"),
  files: z.array(filePartSchema).min(1).optional(),
  id: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
  type: z.literal("user-message"),
  version: workflowStreamVersionSchema,
});

/**
 * Structured events emitted by Code Mode workflows.
 */
export const codeModeStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    domain: z.literal("code-mode"),
    message: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    type: z.literal("status"),
    version: workflowStreamVersionSchema,
  }),
  z.strictObject({
    data: z.string(),
    domain: z.literal("code-mode"),
    stream: logStreamSchema,
    timestamp: z.number().int().nonnegative(),
    type: z.literal("log"),
    version: workflowStreamVersionSchema,
  }),
  z.strictObject({
    domain: z.literal("code-mode"),
    textDelta: z.string(),
    timestamp: z.number().int().nonnegative(),
    type: z.literal("assistant-delta"),
    version: workflowStreamVersionSchema,
  }),
  z.strictObject({
    domain: z.literal("code-mode"),
    input: z.unknown().optional(),
    timestamp: z.number().int().nonnegative(),
    toolName: z.string().min(1),
    type: z.literal("tool-call"),
    version: workflowStreamVersionSchema,
  }),
  z.strictObject({
    domain: z.literal("code-mode"),
    output: z.unknown().optional(),
    timestamp: z.number().int().nonnegative(),
    toolName: z.string().min(1),
    type: z.literal("tool-result"),
    version: workflowStreamVersionSchema,
  }),
  z.strictObject({
    domain: z.literal("code-mode"),
    exitCode: z.number().int(),
    timestamp: z.number().int().nonnegative(),
    type: z.literal("exit"),
    version: workflowStreamVersionSchema,
  }),
]);

/**
 * Union of all supported `data-workflow` payloads.
 */
export const workflowStreamEventSchema = z.union([
  runStreamEventSchema,
  chatUserMessageMarkerSchema,
  codeModeStreamEventSchema,
]);

/** Run stream event type emitted by workflows. */
export type RunStreamEvent = z.infer<typeof runStreamEventSchema>;
/** Chat marker event type emitted by workflows. */
export type ChatUserMessageMarker = z.infer<typeof chatUserMessageMarkerSchema>;
/** Code Mode stream event type emitted by workflows. */
export type CodeModeStreamEvent = z.infer<typeof codeModeStreamEventSchema>;
/** Any workflow stream event type emitted by workflows. */
export type WorkflowStreamEvent = z.infer<typeof workflowStreamEventSchema>;

type WithoutEnvelope<T> = T extends { domain: string; version: number }
  ? Omit<T, "domain" | "version">
  : never;

/** Run event input shape accepted by writers before envelope fields are added. */
export type RunStreamEventInput = WithoutEnvelope<RunStreamEvent>;
/** Chat marker input shape accepted by writers before envelope fields are added. */
export type ChatUserMessageMarkerInput = WithoutEnvelope<ChatUserMessageMarker>;
/** Code Mode event input shape accepted by writers before envelope fields are added. */
export type CodeModeStreamEventInput = WithoutEnvelope<CodeModeStreamEvent>;

/**
 * Attach envelope fields required for run stream events.
 *
 * @param event - Run event payload without envelope fields.
 * @returns Envelope-complete run stream event.
 */
export function createRunStreamEvent(
  event: RunStreamEventInput,
): RunStreamEvent {
  return {
    ...event,
    domain: "run",
    version: WORKFLOW_STREAM_SCHEMA_VERSION,
  };
}

/**
 * Attach envelope fields required for chat user message marker events.
 *
 * @param event - Chat marker payload without envelope fields.
 * @returns Envelope-complete chat marker event.
 */
export function createChatUserMessageMarker(
  event: ChatUserMessageMarkerInput,
): ChatUserMessageMarker {
  return {
    ...event,
    domain: "chat",
    version: WORKFLOW_STREAM_SCHEMA_VERSION,
  };
}

/**
 * Attach envelope fields required for Code Mode stream events.
 *
 * @param event - Code Mode payload without envelope fields.
 * @returns Envelope-complete Code Mode stream event.
 */
export function createCodeModeStreamEvent(
  event: CodeModeStreamEventInput,
): CodeModeStreamEvent {
  return {
    ...event,
    domain: "code-mode",
    version: WORKFLOW_STREAM_SCHEMA_VERSION,
  };
}
