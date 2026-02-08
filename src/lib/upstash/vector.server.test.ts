import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: {
    upstash: {
      vectorRestToken: "vector-token",
      vectorRestUrl: "https://vector.example.com",
    },
  },
  indexCtor: vi.fn(),
}));

vi.mock("@upstash/vector", () => ({
  Index: class IndexMock {
    public constructor(options: unknown) {
      state.indexCtor(options);
    }
  },
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("upstash vector helpers", () => {
  it("memoizes the Index client and reads env only once", async () => {
    const mod = await import("@/lib/upstash/vector.server");

    const idx1 = mod.getVectorIndex();
    const idx2 = mod.getVectorIndex();

    expect(idx1).toBe(idx2);
    expect(state.indexCtor).toHaveBeenCalledTimes(1);
    expect(state.indexCtor).toHaveBeenCalledWith({
      token: "vector-token",
      url: "https://vector.example.com",
    });
  });

  it("builds stable namespaces", async () => {
    const mod = await import("@/lib/upstash/vector.server");

    expect(mod.projectChunksNamespace("proj")).toBe("project:proj:chunks");
    expect(mod.projectArtifactsNamespace("proj")).toBe(
      "project:proj:artifacts",
    );
    expect(mod.projectRepoNamespace("proj", "repo")).toBe(
      "project:proj:repo:repo",
    );
  });
});
