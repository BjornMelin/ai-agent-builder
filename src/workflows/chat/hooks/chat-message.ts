import { defineHook } from "workflow";
import { z } from "zod";

/**
 * Payload schema for injecting a follow-up message into a multi-turn chat run.
 */
const chatMessageSchema = z.object({
  message: z.string().min(1),
});

/**
 * Hook used to resume an in-flight multi-turn chat workflow with a new user message.
 *
 * @remarks
 * The hook token is the Workflow run ID, allowing the client to resume the same
 * workflow run via `POST /api/chat/:runId`.
 */
export const chatMessageHook = defineHook({
  schema: chatMessageSchema,
});
