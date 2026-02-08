import { makeToolOptions } from "@tests/utils/tool-execution-options";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { budgets } from "@/lib/config/budgets.server";
import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  extractWebPage: vi.fn(),
}));

vi.mock("@/lib/ai/tools/web-extract.server", () => ({
  extractWebPage: state.extractWebPage,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.extractWebPage.mockResolvedValue({
    description: null,
    extractedAt: new Date(0).toISOString(),
    markdown: "# doc",
    publishedTime: null,
    title: "Doc",
    url: "https://example.com",
  });
});

describe("webExtractStep", () => {
  it("rejects invalid input", async () => {
    const { webExtractStep } = await import(
      "@/workflows/chat/steps/web-extract.step"
    );

    await expect(
      webExtractStep(
        { url: "" },
        makeToolOptions({ ctx: { projectId: "proj_1" } }),
      ),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("rejects when project context is missing", async () => {
    const { webExtractStep } = await import(
      "@/workflows/chat/steps/web-extract.step"
    );

    await expect(
      webExtractStep(
        { url: "https://example.com" },
        makeToolOptions({ ctx: undefined }),
      ),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("enforces per-turn web extract budget", async () => {
    const { webExtractStep } = await import(
      "@/workflows/chat/steps/web-extract.step"
    );

    const ctx = {
      modeId: "researcher",
      projectId: "proj_1",
      toolBudget: {
        context7Calls: 0,
        webExtractCalls: budgets.maxWebExtractCallsPerTurn,
        webSearchCalls: 0,
      },
    };

    await expect(
      webExtractStep({ url: "https://example.com" }, makeToolOptions({ ctx })),
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    } satisfies Partial<AppError>);

    expect(state.extractWebPage).not.toHaveBeenCalled();
  });

  it("increments budget counters and forwards extraction args", async () => {
    const { webExtractStep } = await import(
      "@/workflows/chat/steps/web-extract.step"
    );

    const ctx = {
      modeId: "researcher",
      projectId: "proj_1",
      toolBudget: { context7Calls: 0, webExtractCalls: 0, webSearchCalls: 0 },
    };

    await expect(
      webExtractStep(
        { maxChars: 10, url: "https://example.com" },
        makeToolOptions({ ctx }),
      ),
    ).resolves.toMatchObject({ url: "https://example.com" });

    expect(ctx.toolBudget.webExtractCalls).toBe(1);
    expect(state.extractWebPage).toHaveBeenCalledWith({
      maxChars: 10,
      url: "https://example.com",
    });
  });
});
