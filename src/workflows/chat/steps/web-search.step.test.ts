import { makeToolOptions } from "@tests/utils/tool-execution-options";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { budgets } from "@/lib/config/budgets.server";
import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({ searchWeb: vi.fn() }));

vi.mock("@/lib/ai/tools/web-search.server", () => ({
  searchWeb: state.searchWeb,
}));

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
      webSearchStep({ query: "" }, makeToolOptions({ ctx: undefined })),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("forwards normalized search arguments", async () => {
    const { webSearchStep } = await import(
      "@/workflows/chat/steps/web-search.step"
    );
    const controller = new AbortController();

    await expect(
      webSearchStep(
        {
          endPublishedDate: "2026-02-07",
          includeDomains: ["example.com"],
          numResults: budgets.maxWebSearchResults,
          query: "Next.js",
          startPublishedDate: "2026-01-01",
        },
        makeToolOptions({ ctx: undefined, signal: controller.signal }),
      ),
    ).resolves.toMatchObject({ requestId: "req" });

    expect(state.searchWeb).toHaveBeenCalledWith({
      abortSignal: controller.signal,
      endPublishedDate: "2026-02-07",
      excludeDomains: undefined,
      includeDomains: ["example.com"],
      numResults: budgets.maxWebSearchResults,
      query: "Next.js",
      startPublishedDate: "2026-01-01",
    });
  });
});
