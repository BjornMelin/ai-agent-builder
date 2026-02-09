import "server-only";

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ModelMessage } from "ai";
import type { CompactOptions } from "ctx-zip";

type CtxZipCompact = (
  messages: ModelMessage[],
  options?: CompactOptions,
) => Promise<ModelMessage[]>;

let compactPromise: Promise<CtxZipCompact> | null = null;

async function getCtxZipCompact(): Promise<CtxZipCompact> {
  if (!compactPromise) {
    compactPromise = (async () => {
      // `ctx-zip` root import is currently broken under strict Node ESM resolution due to
      // `./tool-results-compactor/index.js` importing `./compact` without an extension.
      // We load the compactor directly by file path instead.
      const require = createRequire(import.meta.url);
      const ctxZipEntryPath = require.resolve("ctx-zip");
      const compactEntryPath = path.join(
        path.dirname(ctxZipEntryPath),
        "tool-results-compactor",
        "compact.js",
      );

      const mod = (await import(
        pathToFileURL(compactEntryPath).href
      )) as unknown;

      if (!mod || typeof mod !== "object") {
        throw new Error("Failed to load ctx-zip compactor module.");
      }

      const maybeCompact = (mod as { compact?: unknown }).compact;
      if (typeof maybeCompact !== "function") {
        throw new Error("Failed to load ctx-zip compact() function.");
      }

      return maybeCompact as CtxZipCompact;
    })();
  }

  return await compactPromise;
}

/**
 * Compact tool-heavy agent messages by persisting tool results to sandbox storage.
 *
 * @remarks
 * This wrapper avoids importing `ctx-zip` from the package root at runtime. It loads
 * the compactor implementation directly to preserve compatibility with Node's ESM
 * resolution in server builds.
 *
 * @param messages - AI SDK model messages to compact.
 * @param options - ctx-zip compaction options.
 * @returns Compacted message list.
 */
export async function compactToolResults(
  messages: readonly ModelMessage[],
  options: CompactOptions,
): Promise<ModelMessage[]> {
  const compact = await getCtxZipCompact();
  return await compact(Array.from(messages), options);
}
