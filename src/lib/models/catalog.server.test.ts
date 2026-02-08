import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  readFile: vi.fn(),
  tagModelCatalog: vi.fn(() => "aab:models:catalog"),
  warn: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => state.readFile(...args),
}));

vi.mock("next/cache", () => ({
  cacheLife: state.cacheLife,
  cacheTag: state.cacheTag,
}));

vi.mock("@/lib/cache/tags", () => ({
  tagModelCatalog: state.tagModelCatalog,
}));

vi.mock("@/lib/core/log", () => ({
  log: { warn: state.warn },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("loadModelCatalog", () => {
  it("returns [] when the catalog file cannot be read", async () => {
    state.readFile.mockRejectedValueOnce(new Error("missing"));

    const { loadModelCatalog } = await import("@/lib/models/catalog.server");
    const res = await loadModelCatalog();

    expect(res).toEqual([]);
    expect(state.warn).toHaveBeenCalledTimes(1);
  });

  it("returns [] when the parsed JSON is not an array", async () => {
    state.readFile.mockResolvedValueOnce(JSON.stringify({ ok: true }));

    const { loadModelCatalog } = await import("@/lib/models/catalog.server");
    const res = await loadModelCatalog();

    expect(res).toEqual([]);
  });

  it("filters invalid entries and preserves known optional fields", async () => {
    state.readFile.mockResolvedValueOnce(
      JSON.stringify([
        { id: "" },
        null,
        {
          created: 123,
          id: "openai/gpt-4o",
          object: "model",
          owned_by: "openai",
        },
        { id: "anthropic/claude", owned_by: 123 },
      ]),
    );

    const { loadModelCatalog } = await import("@/lib/models/catalog.server");
    const res = await loadModelCatalog();

    expect(res).toEqual([
      {
        created: 123,
        id: "openai/gpt-4o",
        object: "model",
        owned_by: "openai",
      },
      { id: "anthropic/claude" },
    ]);
    expect(state.cacheLife).toHaveBeenCalled();
    expect(state.cacheTag).toHaveBeenCalledWith("aab:models:catalog");
  });
});
