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

let cachedClientPromise: Promise<MCPClient> | undefined;
type Context7Toolset = Awaited<ReturnType<MCPClient["tools"]>>;

let cachedToolsetPromise: Promise<Context7Toolset> | undefined;

async function getClient(): Promise<MCPClient> {
  cachedClientPromise ??= createMCPClient(getClientConfig());
  return cachedClientPromise;
}

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

async function getToolset(): Promise<Context7Toolset> {
  if (!cachedToolsetPromise) {
    cachedToolsetPromise = (async () => {
      const client = await getClient();
      return client.tools();
    })();
  }

  return cachedToolsetPromise;
}

function assertMaxBytes(value: unknown) {
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > budgets.maxContext7ResponseBytes) {
    throw new AppError(
      "bad_request",
      400,
      "Context7 response exceeded size budget.",
    );
  }
}

function cacheKey(toolName: Context7ToolName, args: unknown): string {
  const payload = JSON.stringify({ args, toolName, v: 1 });
  return `cache:context7:${toolName}:${sha256Hex(payload)}`;
}

async function callContext7Tool(
  toolName: Context7ToolName,
  args: unknown,
): Promise<unknown> {
  const redis = getRedisOptional();
  const key = cacheKey(toolName, args);

  if (redis) {
    const cached = await redis.get<unknown>(key);
    if (cached) return cached;
  }

  const toolset = await getToolset();
  const tool = toolset[toolName];
  if (!tool) {
    throw new AppError(
      "bad_request",
      400,
      `Context7 tool not available: ${toolName}.`,
    );
  }

  const result = await tool.execute(args, {
    messages: [],
    toolCallId: `context7:${toolName}`,
  } satisfies ToolExecutionOptions);
  assertMaxBytes(result);

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
 * @param input - Resolve input.
 * @returns Context7 response payload (pass-through).
 */
export async function context7ResolveLibraryId(
  input: Readonly<{ libraryName: string; query: string }>,
): Promise<unknown> {
  return callContext7Tool("resolve-library-id", input);
}

/**
 * Query Context7 docs for a specific libraryId.
 *
 * @param input - Query input.
 * @returns Context7 response payload (pass-through).
 */
export async function context7QueryDocs(
  input: Readonly<{ libraryId: string; query: string }>,
): Promise<unknown> {
  return callContext7Tool("query-docs", input);
}
