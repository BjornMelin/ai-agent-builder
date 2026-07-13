import { makeToolOptions } from "@tests/utils/tool-execution-options";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({ extractWebPage: vi.fn() }));

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
      webExtractStep({ url: "" }, makeToolOptions({ ctx: undefined })),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("forwards extraction arguments and abort signal", async () => {
    const { webExtractStep } = await import(
      "@/workflows/chat/steps/web-extract.step"
    );
    const controller = new AbortController();
    await expect(
      webExtractStep(
        { maxChars: 10, url: "https://example.com" },
        makeToolOptions({ ctx: undefined, signal: controller.signal }),
      ),
    ).resolves.toMatchObject({ url: "https://example.com" });

    expect(state.extractWebPage).toHaveBeenCalledWith({
      abortSignal: controller.signal,
      maxChars: 10,
      url: "https://example.com",
    });
  });
});
