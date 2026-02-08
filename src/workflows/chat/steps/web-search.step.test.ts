import type { ToolExecutionOptions } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { budgets } from "@/lib/config/budgets.server";
import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  searchWeb: vi.fn(),
}));

vi.mock("@/lib/ai/tools/web-search.server", () => ({
  searchWeb: state.searchWeb,
}));

function makeOptions(ctx: unknown): ToolExecutionOptions {
  return {
    experimental_context: ctx,
    messages: [],
    toolCallId: "test",
  } as unknown as ToolExecutionOptions;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.searchWeb.mockResolvedValue({ requestId: "req", results: [] });
});

describe("webSearchStep", () => {
  it("rejects invalid input", async () => {
    const { webSearchStep } = await import(
      "@/workflows/chat/steps/web-search.step"
    );

    await expect(
      webSearchStep({ query: "" }, makeOptions({ projectId: "proj_1" })),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("rejects when project context is missing", async () => {
    const { webSearchStep } = await import(
      "@/workflows/chat/steps/web-search.step"
    );

    await expect(
      webSearchStep({ query: "x" }, makeOptions(undefined)),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("enforces per-turn web search budget", async () => {
    const { webSearchStep } = await import(
      "@/workflows/chat/steps/web-search.step"
    );

    const ctx = {
      modeId: "researcher",
      projectId: "proj_1",
      toolBudget: {
        context7Calls: 0,
        webExtractCalls: 0,
        webSearchCalls: budgets.maxWebSearchCallsPerTurn,
      },
    };

    await expect(
      webSearchStep({ query: "x" }, makeOptions(ctx)),
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    } satisfies Partial<AppError>);

    expect(state.searchWeb).not.toHaveBeenCalled();
  });

  it("increments budget counters and forwards normalized search args", async () => {
    const { webSearchStep } = await import(
      "@/workflows/chat/steps/web-search.step"
    );

    const ctx = {
      modeId: "researcher",
      projectId: "proj_1",
      toolBudget: { context7Calls: 0, webExtractCalls: 0, webSearchCalls: 0 },
    };

    await expect(
      webSearchStep(
        {
          endPublishedDate: "2026-02-07",
          includeDomains: ["example.com"],
          numResults: budgets.maxWebSearchResults,
          query: "Next.js",
          startPublishedDate: "2026-01-01",
        },
        makeOptions(ctx),
      ),
    ).resolves.toMatchObject({ requestId: "req" });

    expect(ctx.toolBudget.webSearchCalls).toBe(1);
    expect(state.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        endPublishedDate: "2026-02-07",
        includeDomains: ["example.com"],
        numResults: budgets.maxWebSearchResults,
        query: "Next.js",
        startPublishedDate: "2026-01-01",
      }),
    );
  });
});
