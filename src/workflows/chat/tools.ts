import type { JSONSchema7 } from "@ai-sdk/provider";
import { jsonSchema, type ToolSet, tool } from "ai";
import { z } from "zod";
import { budgets } from "@/lib/config/budgets.server";
import { retrieveProjectChunksStep } from "@/workflows/chat/steps/retrieve-project-chunks.step";

const retrieveProjectChunksInput = z.strictObject({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(budgets.maxVectorTopK).optional(),
});

type RetrieveProjectChunksToolInput = Readonly<{
  query: string;
  topK?: number | undefined;
}>;

const retrieveProjectChunksTool = tool({
  description:
    "Retrieve the most relevant chunks from this project's knowledge base. Use this to ground answers in uploaded sources.",
  execute: retrieveProjectChunksStep,
  inputSchema: jsonSchema<RetrieveProjectChunksToolInput>(
    {
      additionalProperties: false,
      properties: {
        query: { minLength: 1, type: "string" },
        topK: {
          maximum: budgets.maxVectorTopK,
          minimum: 1,
          type: "integer",
        },
      },
      required: ["query"],
      type: "object",
    } satisfies JSONSchema7,
    {
      validate: (value) => {
        const parsed = retrieveProjectChunksInput.safeParse(value);
        return parsed.success
          ? { success: true, value: parsed.data }
          : { error: parsed.error, success: false };
      },
    },
  ),
});

/**
 * Toolset for project-scoped chat.
 */
export const chatTools = {
  retrieveProjectChunks: retrieveProjectChunksTool,
} satisfies ToolSet;
