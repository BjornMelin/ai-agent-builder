import "server-only";

import {
  createMCPClient,
  type MCPClient,
  type MCPClientConfig,
} from "@ai-sdk/mcp";
import type { ToolExecutionOptions } from "@ai-sdk/provider-utils";

import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import { env } from "@/lib/env";
import { getRedis } from "@/lib/upstash/redis.server";

type Context7ToolName = "resolve-library-id" | "query-docs";

function getRedisOptional() {
  try {
    return getRedis();
  } catch {
    return null;
  }
}

type Context7Toolset = Awaited<ReturnType<MCPClient["tools"]>>;

function getClientConfig(): MCPClientConfig {
  const apiKey = env.context7.apiKey;
  return {
    transport: {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      type: "http",
      url: "https://mcp.context7.com/mcp",
    },
  };
}

async function withToolset<T>(
  fn: (toolset: Context7Toolset) => Promise<T>,
): Promise<T> {
  const client = await createMCPClient(getClientConfig());
  try {
    const toolset = await client.tools();
    return await fn(toolset);
  } finally {
    await client.close().catch(() => {
      // Best-effort cleanup.
    });
  }
}

function assertMaxBytes(value: unknown) {
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > budgets.maxContext7ResponseBytes) {
    throw new AppError(
      "bad_gateway",
      502,
      "Context7 response exceeded size budget.",
    );
  }
}

function cacheKey(toolName: Context7ToolName, args: unknown): string {
  const payload = JSON.stringify({ args, toolName, v: 1 });
  return `cache:context7:${toolName}:${sha256Hex(payload)}`;
}

function addAbortListener(
  signal: AbortSignal,
  onAbort: () => void,
): () => void {
  if (signal.aborted) {
    onAbort();
    return () => undefined;
  }

  signal.addEventListener("abort", onAbort, { once: true });
  return () => {
    signal.removeEventListener("abort", onAbort);
  };
}

async function callContext7Tool(
  toolName: Context7ToolName,
  args: unknown,
  options: Readonly<{ abortSignal?: AbortSignal | undefined }> = {},
): Promise<unknown> {
  const redis = getRedisOptional();
  const key = cacheKey(toolName, args);

  if (redis) {
    const cached = await redis.get<unknown>(key);
    if (cached) return cached;
  }

  const controller = new AbortController();
  let abortedByTimeout = false;
  const cleanupFns: Array<() => void> = [];

  if (options.abortSignal) {
    cleanupFns.push(
      addAbortListener(options.abortSignal, () => {
        controller.abort(options.abortSignal?.reason);
      }),
    );
  }

  const timeoutId = setTimeout(() => {
    abortedByTimeout = true;
    controller.abort(new Error("Context7 request timed out."));
  }, budgets.context7TimeoutMs);
  cleanupFns.push(() => clearTimeout(timeoutId));

  let result: unknown;
  try {
    result = await withToolset(async (toolset) => {
      const tool = toolset[toolName];
      if (!tool) {
        throw new AppError(
          "bad_request",
          400,
          `Context7 tool not available: ${toolName}.`,
        );
      }

      const toolResult = await tool.execute(args, {
        abortSignal: controller.signal,
        messages: [],
        toolCallId: `context7:${toolName}`,
      } satisfies ToolExecutionOptions);
      assertMaxBytes(toolResult);
      return toolResult;
    });
  } catch (error) {
    if (abortedByTimeout) {
      throw new AppError("upstream_timeout", 504, "Context7 timed out.");
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("bad_gateway", 502, "Context7 request failed.", error);
  } finally {
    for (const fn of cleanupFns) {
      fn();
    }
  }

  if (redis) {
    await redis
      .setex(key, budgets.context7CacheTtlSeconds, result)
      .catch(() => {
        // Best-effort cache write.
      });
  }

  return result;
}

/**
 * Resolve a human library name to a Context7 libraryId.
 *
 * @remarks
 * Context7 responses are treated as an opaque pass-through payload at this layer.
 * Callers must validate/cast based on the specific tool they invoked.
 *
 * @param input - Resolve input.
 * @param options - Optional abort signal propagation.
 * @returns Context7 response payload (pass-through).
 */
export async function context7ResolveLibraryId(
  input: Readonly<{ libraryName: string; query: string }>,
  options: Readonly<{ abortSignal?: AbortSignal | undefined }> = {},
): Promise<unknown> {
  return callContext7Tool("resolve-library-id", input, options);
}

/**
 * Query Context7 docs for a specific libraryId.
 *
 * @remarks
 * Context7 responses are treated as an opaque pass-through payload at this layer.
 * Callers must validate/cast based on the specific tool they invoked.
 *
 * @param input - Query input.
 * @param options - Optional abort signal propagation.
 * @returns Context7 response payload (pass-through).
 */
export async function context7QueryDocs(
  input: Readonly<{ libraryId: string; query: string }>,
  options: Readonly<{ abortSignal?: AbortSignal | undefined }> = {},
): Promise<unknown> {
  return callContext7Tool("query-docs", input, options);
}
