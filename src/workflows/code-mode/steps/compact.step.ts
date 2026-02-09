import "server-only";

import type { ModelMessage } from "ai";
import { createCtxZipManagerForSandboxId } from "@/lib/sandbox/ctxzip.server";
import { compactToolResults } from "@/lib/sandbox/ctxzip-compactor.server";

/**
 * Compact tool-heavy agent messages by writing tool results to sandbox files.
 *
 * @param input - Sandbox identity + messages.
 * @returns Compacted messages and compact directory path.
 */
export async function compactCodeModeMessagesStep(
  input: Readonly<{
    sandboxId: string;
    sessionId: string;
    messages: readonly ModelMessage[];
  }>,
): Promise<Readonly<{ compacted: ModelMessage[]; compactDir: string }>> {
  "use step";

  const { manager, fileAdapter } = await createCtxZipManagerForSandboxId(
    input.sandboxId,
    input.sessionId,
  );

  const compacted = await compactToolResults(input.messages, {
    boundary: { count: 8, type: "keep-last" },
    sessionId: input.sessionId,
    storage: fileAdapter,
    strategy: "write-tool-results-to-file",
  });

  return { compactDir: manager.getCompactDir(), compacted };
}
