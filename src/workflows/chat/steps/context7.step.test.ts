import { makeToolOptions } from "@tests/utils/tool-execution-options";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
        makeToolOptions({ ctx: undefined }),
      ),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
    expect(state.context7ResolveLibraryId).not.toHaveBeenCalled();
  });

  it("forwards resolve and query calls with their abort signal", async () => {
    const { context7QueryDocsStep, context7ResolveLibraryIdStep } =
      await import("@/workflows/chat/steps/context7.step");
    const controller = new AbortController();
    const options = makeToolOptions({
      ctx: undefined,
      signal: controller.signal,
    });

    await expect(
      context7ResolveLibraryIdStep(
        { libraryName: "react", query: "useState" },
        options,
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      context7QueryDocsStep(
        { libraryId: "/facebook/react", query: "useState" },
        options,
      ),
    ).resolves.toEqual({ ok: true });

    expect(state.context7ResolveLibraryId).toHaveBeenCalledWith(
      { libraryName: "react", query: "useState" },
      { abortSignal: controller.signal },
    );
    expect(state.context7QueryDocs).toHaveBeenCalledWith(
      { libraryId: "/facebook/react", query: "useState" },
      { abortSignal: controller.signal },
    );
  });
});
