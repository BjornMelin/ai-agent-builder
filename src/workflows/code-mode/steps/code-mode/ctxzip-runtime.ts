import "server-only";

import type { ToolSet } from "ai";
import type { FileAdapter } from "ctx-zip";
import {
  createCtxZipSandboxCodeMode,
  type VercelSandboxLike,
} from "@/lib/sandbox/ctxzip.server";
import { nowTimestamp } from "@/workflows/_shared/workflow-run-utils";
import { SANDBOX_WORKSPACE_ROOT } from "@/workflows/code-mode/steps/code-mode/sandbox-paths";

export type CtxZipRuntime = Readonly<{
  ctxZipTools: ToolSet;
  storage: FileAdapter | null;
  cleanup: () => Promise<void>;
}>;

/**
 * Best-effort enable ctx-zip tool result compaction for Code Mode.
 *
 * @param input - Sandbox wrapper and session settings.
 * @returns Enabled ctx-zip runtime (or disabled fallback).
 */
export async function enableCtxZipRuntime(
  input: Readonly<{
    sandbox: VercelSandboxLike;
    sessionId: string;
    writeStatus: (
      event: Readonly<{ message: string; timestamp: number; type: "status" }>,
    ) => Promise<void>;
  }>,
): Promise<CtxZipRuntime> {
  const ctxZipTools: ToolSet = {};

  try {
    const ctxZip = await createCtxZipSandboxCodeMode({
      sandbox: input.sandbox,
      stopOnCleanup: false,
      workspacePath: SANDBOX_WORKSPACE_ROOT,
    });

    const storage = ctxZip.manager.getFileAdapter({
      sessionId: input.sessionId,
    });

    const catTool = ctxZip.tools.sandbox_cat;
    if (catTool) ctxZipTools.sandbox_cat = catTool;
    const findTool = ctxZip.tools.sandbox_find;
    if (findTool) ctxZipTools.sandbox_find = findTool;
    const grepTool = ctxZip.tools.sandbox_grep;
    if (grepTool) ctxZipTools.sandbox_grep = grepTool;
    const lsTool = ctxZip.tools.sandbox_ls;
    if (lsTool) ctxZipTools.sandbox_ls = lsTool;

    await input.writeStatus({
      message: "ctx-zip compaction enabled (write tool results to sandbox).",
      timestamp: nowTimestamp(),
      type: "status",
    });

    return {
      cleanup: async () => {
        try {
          await ctxZip.manager.cleanup();
        } catch {
          // Best effort only.
        }
      },
      ctxZipTools,
      storage,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to enable ctx-zip.";
    await input.writeStatus({
      message: `ctx-zip compaction disabled: ${message}`,
      timestamp: nowTimestamp(),
      type: "status",
    });

    return {
      cleanup: async () => {},
      ctxZipTools,
      storage: null,
    };
  }
}
