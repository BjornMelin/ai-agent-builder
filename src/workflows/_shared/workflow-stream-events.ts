import { z } from "zod";

/** Current schema version for workflow stream payloads. */
export const WORKFLOW_STREAM_SCHEMA_VERSION = 2 as const;

/** Authenticated stream response header carrying the persisted Code Mode run status. */
export const CODE_MODE_RUN_STATUS_HEADER = "x-code-mode-run-status";

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

/** Terminal statuses accepted by the Code Mode stream protocol. */
export const codeModeTerminalStatusSchema = z.enum([
  "succeeded",
  "failed",
  "canceled",
]);

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
 * Lifecycle markers emitted by multi-turn chat workflows.
 *
 * @remarks
 * These markers are the durable client protocol for distinguishing active
 * generation from the interval where the workflow is awaiting a follow-up.
 */
export const chatSessionStatusSchema = z.strictObject({
  domain: z.literal("chat"),
  status: z.enum(["running", "waiting"]),
  timestamp: z.number().int().nonnegative(),
  type: z.literal("session-status"),
  version: workflowStreamVersionSchema,
});

/** Durable admission outcome for a queued chat follow-up delivery. */
export const chatFollowUpDispositionSchema = z.strictObject({
  domain: z.literal("chat"),
  messageId: z.string().min(1),
  outcome: z.enum(["duplicate", "rejected"]),
  reason: z.enum([
    "already_committed",
    "not_waiting",
    "payload_mismatch",
    "stale_delivery",
  ]),
  timestamp: z.number().int().nonnegative(),
  type: z.literal("follow-up-disposition"),
  version: workflowStreamVersionSchema,
});

/** Replay-safe envelope for one assistant UI stream chunk. */
export const chatAssistantStreamChunkSchema = z.strictObject({
  assistantMessageId: z.string().min(1),
  chunk: z.record(z.string(), z.unknown()),
  domain: z.literal("chat"),
  sequence: z.number().int().nonnegative(),
  type: z.literal("assistant-stream-chunk"),
  version: workflowStreamVersionSchema,
});

/** Authoritative terminal status emitted only after chat-thread persistence. */
export const chatTerminalStatusSchema = z.strictObject({
  domain: z.literal("chat"),
  status: z.enum(["succeeded", "failed", "canceled"]),
  timestamp: z.number().int().nonnegative(),
  type: z.literal("terminal"),
  version: workflowStreamVersionSchema,
});

/** Structured events emitted by chat workflows. */
export const chatStreamEventSchema = z.discriminatedUnion("type", [
  chatUserMessageMarkerSchema,
  chatSessionStatusSchema,
  chatFollowUpDispositionSchema,
  chatAssistantStreamChunkSchema,
  chatTerminalStatusSchema,
]);

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
    status: codeModeTerminalStatusSchema,
    timestamp: z.number().int().nonnegative(),
    type: z.literal("terminal"),
    version: workflowStreamVersionSchema,
  }),
]);

/**
 * Union of all supported `data-workflow` payloads.
 */
export const workflowStreamEventSchema = z.union([
  runStreamEventSchema,
  chatStreamEventSchema,
  codeModeStreamEventSchema,
]);

/** Run stream event type emitted by workflows. */
export type RunStreamEvent = z.infer<typeof runStreamEventSchema>;
/** Chat marker event type emitted by workflows. */
export type ChatUserMessageMarker = z.infer<typeof chatUserMessageMarkerSchema>;
/** Chat lifecycle status event type emitted by workflows. */
export type ChatSessionStatus = z.infer<typeof chatSessionStatusSchema>;
/** Durable outcome of workflow-side follow-up admission. */
export type ChatFollowUpDisposition = z.infer<
  typeof chatFollowUpDispositionSchema
>;
/** Replay-safe assistant UI stream chunk. */
export type ChatAssistantStreamChunk = z.infer<
  typeof chatAssistantStreamChunkSchema
>;
/** Authoritative terminal chat event emitted after persistence. */
export type ChatTerminalStatus = z.infer<typeof chatTerminalStatusSchema>;
/** Any structured chat event emitted by workflows. */
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
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
/** Chat lifecycle event input accepted before envelope fields are added. */
export type ChatSessionStatusInput = WithoutEnvelope<ChatSessionStatus>;
/** Follow-up disposition input accepted before envelope fields are added. */
export type ChatFollowUpDispositionInput =
  WithoutEnvelope<ChatFollowUpDisposition>;
/** Assistant stream chunk input accepted before envelope fields are added. */
export type ChatAssistantStreamChunkInput =
  WithoutEnvelope<ChatAssistantStreamChunk>;
/** Terminal chat event input accepted before envelope fields are added. */
export type ChatTerminalStatusInput = WithoutEnvelope<ChatTerminalStatus>;
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
 * Attach envelope fields required for chat lifecycle events.
 *
 * @param event - Chat lifecycle payload without envelope fields.
 * @returns Envelope-complete chat lifecycle event.
 */
export function createChatSessionStatus(
  event: ChatSessionStatusInput,
): ChatSessionStatus {
  return {
    ...event,
    domain: "chat",
    version: WORKFLOW_STREAM_SCHEMA_VERSION,
  };
}

/**
 * Attach envelope fields required for chat follow-up disposition events.
 *
 * @param event - Follow-up disposition payload without envelope fields.
 * @returns Envelope-complete follow-up disposition event.
 */
export function createChatFollowUpDisposition(
  event: ChatFollowUpDispositionInput,
): ChatFollowUpDisposition {
  return {
    ...event,
    domain: "chat",
    version: WORKFLOW_STREAM_SCHEMA_VERSION,
  };
}

/**
 * Attach envelope fields to one replay-safe assistant stream chunk.
 *
 * @param event - Assistant stream chunk without envelope fields.
 * @returns Envelope-complete assistant stream chunk.
 */
export function createChatAssistantStreamChunk(
  event: ChatAssistantStreamChunkInput,
): ChatAssistantStreamChunk {
  return {
    ...event,
    domain: "chat",
    version: WORKFLOW_STREAM_SCHEMA_VERSION,
  };
}

/**
 * Attach envelope fields required for authoritative chat terminal events.
 *
 * @param event - Terminal chat payload without envelope fields.
 * @returns Envelope-complete terminal chat event.
 */
export function createChatTerminalStatus(
  event: ChatTerminalStatusInput,
): ChatTerminalStatus {
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
