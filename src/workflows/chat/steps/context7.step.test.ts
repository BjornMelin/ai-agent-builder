import { makeToolOptions } from "@tests/utils/tool-execution-options";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { budgets } from "@/lib/config/budgets.server";
import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  context7QueryDocs: vi.fn(),
  context7ResolveLibraryId: vi.fn(),
}));

vi.mock("@/lib/ai/tools/mcp-context7.server", () => ({
  context7QueryDocs: state.context7QueryDocs,
  context7ResolveLibraryId: state.context7ResolveLibraryId,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.context7ResolveLibraryId.mockResolvedValue({ ok: true });
  state.context7QueryDocs.mockResolvedValue({ ok: true });
});

describe("Context7 tool steps", () => {
  it("rejects invalid resolve input", async () => {
    const { context7ResolveLibraryIdStep } = await import(
      "@/workflows/chat/steps/context7.step"
    );

    await expect(
      context7ResolveLibraryIdStep(
        { libraryName: "", query: "" },
        makeToolOptions({
          ctx: { projectId: "proj_1", toolBudget: { context7Calls: 0 } },
        }),
      ),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);

    expect(state.context7ResolveLibraryId).not.toHaveBeenCalled();
  });

  it("rejects when project context is missing", async () => {
    const { context7ResolveLibraryIdStep } = await import(
      "@/workflows/chat/steps/context7.step"
    );

    await expect(
      context7ResolveLibraryIdStep(
        { libraryName: "react", query: "useState" },
        makeToolOptions({ ctx: undefined }),
      ),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("enforces per-turn Context7 budget", async () => {
    const { context7ResolveLibraryIdStep } = await import(
      "@/workflows/chat/steps/context7.step"
    );

    const ctx = {
      modeId: "architect",
      projectId: "proj_1",
      toolBudget: {
        context7Calls: budgets.maxContext7CallsPerTurn,
        webExtractCalls: 0,
        webSearchCalls: 0,
      },
    };

    await expect(
      context7ResolveLibraryIdStep(
        { libraryName: "react", query: "useState" },
        makeToolOptions({ ctx }),
      ),
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    } satisfies Partial<AppError>);

    expect(state.context7ResolveLibraryId).not.toHaveBeenCalled();
  });

  it("increments budget counters and forwards abortSignal", async () => {
    const { context7ResolveLibraryIdStep } = await import(
      "@/workflows/chat/steps/context7.step"
    );

    const ctx = {
      modeId: "architect",
      projectId: "proj_1",
      toolBudget: { context7Calls: 0, webExtractCalls: 0, webSearchCalls: 0 },
    };
    const controller = new AbortController();

    await expect(
      context7ResolveLibraryIdStep(
        { libraryName: "react", query: "useState" },
        makeToolOptions({ ctx, signal: controller.signal }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(ctx.toolBudget.context7Calls).toBe(1);
    expect(state.context7ResolveLibraryId).toHaveBeenCalledWith(
      { libraryName: "react", query: "useState" },
      { abortSignal: controller.signal },
    );
  });
});
