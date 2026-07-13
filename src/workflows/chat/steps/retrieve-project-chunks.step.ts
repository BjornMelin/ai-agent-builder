import type { ToolExecutionOptions } from "ai";

import {
  type RetrievalHit,
  retrieveProjectChunks,
} from "@/lib/ai/tools/retrieval.server";
import { AppError } from "@/lib/core/errors";
import {
  type ProjectToolContext,
  projectToolContextSchema,
} from "@/workflows/chat/tool-context";

/**
 * Retrieve relevant project chunks for retrieval-augmented generation.
 *
 * @remarks
 * `projectId` is provided via typed tool context to avoid requiring the model
 * to send it (it is user/session-scoped, not model-scoped).
 * @param input - Retrieval input.
 * @param options - Tool execution options.
 * @returns Retrieval hits.
 * @throws AppError - When `projectId` is missing from context or retrieval validation fails.
 */
export async function retrieveProjectChunksStep(
  input: Readonly<{ query: string; topK?: number | undefined }>,
  options: ToolExecutionOptions<ProjectToolContext>,
): Promise<readonly RetrievalHit[]> {
  "use step";

  const parsedContext = projectToolContextSchema.safeParse(options.context);
  if (!parsedContext.success) {
    throw new AppError(
      "bad_request",
      400,
      "Missing project context for retrieval.",
    );
  }

  return retrieveProjectChunks({
    projectId: parsedContext.data.projectId,
    q: input.query,
    ...(input.topK === undefined ? {} : { topK: input.topK }),
  });
}
