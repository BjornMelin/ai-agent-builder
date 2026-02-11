import { defineHook } from "workflow";
import { z } from "zod";

/**
 * Payload schema for injecting a follow-up user message into a multi-turn chat
 * run with optional attachments.
 */
const filePartSchema = z.object({
  filename: z.string().min(1).optional(),
  mediaType: z.string().min(1),
  type: z.literal("file"),
  url: z.string().min(1),
});

const chatMessageSchema = z
  .object({
    files: z.array(filePartSchema).min(1).optional(),
    message: z.string().trim().min(1).optional(),
    messageId: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (!value.message && !value.files) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either message or files.",
        path: ["message"],
      });
    }
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
