import type { ToolExecutionOptions, ToolSet } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toolMocks = vi.hoisted(() => ({
  allowedTools: [] as string[],
  context7: vi.fn(async () => "context7"),
  research: vi.fn(async () => "research"),
  webExtract: vi.fn(async () => "extract"),
  webSearch: vi.fn(async () => "search"),
}));

vi.mock("@/lib/ai/agents/registry.server", () => ({
  getEnabledAgentMode: vi.fn(() => ({
    allowedTools: toolMocks.allowedTools,
  })),
}));

vi.mock("@/workflows/chat/tools", () => ({
  chatTools: {
    "context7.query-docs": { execute: toolMocks.context7 },
    "research.create-report": { execute: toolMocks.research },
    "web.extract": { execute: toolMocks.webExtract },
    "web.search": { execute: toolMocks.webSearch },
  },
}));

import { buildChatToolsForMode } from "@/lib/ai/tools/factory.server";
import { budgets } from "@/lib/config/budgets.server";

type ExecutableTool = {
  execute?: (input: unknown, options: ToolExecutionOptions<unknown>) => unknown;
};

const toolOptions: ToolExecutionOptions<unknown> = {
  context: undefined,
  messages: [],
  toolCallId: "test-call",
};

function executeTool(tools: ToolSet, toolId: string): unknown {
  const execute = (tools[toolId] as ExecutableTool | undefined)?.execute;
  if (!execute) throw new Error(`Missing executable tool: ${toolId}`);
  return execute({}, toolOptions);
}

beforeEach(() => {
  vi.clearAllMocks();
  toolMocks.allowedTools = [];
});

describe("buildChatToolsForMode budgets", () => {
  it("rejects the sequential Context7 call after the exact turn limit", async () => {
    toolMocks.allowedTools = ["context7.query-docs"];
    const tools = buildChatToolsForMode("architect");

    for (let index = 0; index < budgets.maxContext7CallsPerTurn; index += 1) {
      await executeTool(tools, "context7.query-docs");
    }

    expect(() => executeTool(tools, "context7.query-docs")).toThrowError(
      "Context7 budget exceeded for this turn.",
    );
    expect(toolMocks.context7).toHaveBeenCalledTimes(
      budgets.maxContext7CallsPerTurn,
    );
  });

  it("rejects one of Promise.all's max-plus-one web searches before execution", async () => {
    toolMocks.allowedTools = ["web.search"];
    const tools = buildChatToolsForMode("researcher");
    const attempts = Array.from(
      { length: budgets.maxWebSearchCallsPerTurn + 1 },
      () => Promise.resolve().then(() => executeTool(tools, "web.search")),
    );

    await expect(Promise.all(attempts)).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    });
    expect(toolMocks.webSearch).toHaveBeenCalledTimes(
      budgets.maxWebSearchCallsPerTurn,
    );
  });

  it("rejects an over-budget research cost atomically without running the report", async () => {
    toolMocks.allowedTools = [
      "research.create-report",
      "web.extract",
      "web.search",
    ];
    const tools = buildChatToolsForMode("researcher");

    await executeTool(tools, "web.extract");
    await executeTool(tools, "web.extract");

    expect(() => executeTool(tools, "research.create-report")).toThrowError(
      "Web extract budget exceeded for this turn.",
    );
    expect(toolMocks.research).not.toHaveBeenCalled();

    for (let index = 0; index < budgets.maxWebSearchCallsPerTurn; index += 1) {
      await executeTool(tools, "web.search");
    }
    expect(() => executeTool(tools, "web.search")).toThrowError(
      "Web search budget exceeded for this turn.",
    );
    expect(toolMocks.webSearch).toHaveBeenCalledTimes(
      budgets.maxWebSearchCallsPerTurn,
    );
  });
});
