import { withEnv } from "@tests/utils/env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock("@/lib/net/fetch-with-timeout.server", () => ({
  fetchWithTimeout: (...args: unknown[]) => state.fetchWithTimeout(...args),
}));

async function loadModule() {
  vi.resetModules();
  return await import("@/lib/skills-registry/github-archive.server");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

function okZip(bytes: Uint8Array) {
  return {
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ok: true,
    status: 200,
  };
}

describe("downloadGithubRepoZip", () => {
  it("downloads main branch when available", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    state.fetchWithTimeout.mockResolvedValueOnce(okZip(bytes));

    const mod = await loadModule();
    await expect(
      mod.downloadGithubRepoZip({ owner: "vercel-labs", repo: "skills" }),
    ).resolves.toEqual({ branch: "main", bytes });

    const [url] = state.fetchWithTimeout.mock.calls[0] ?? [];
    expect(String(url)).toContain("/zip/refs/heads/main");
  });

  it("falls back to master when main returns 404", async () => {
    const bytes = new Uint8Array([4, 5, 6]);
    state.fetchWithTimeout
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce(okZip(bytes));

    const mod = await loadModule();
    await expect(
      mod.downloadGithubRepoZip({ owner: "vercel-labs", repo: "skills" }),
    ).resolves.toEqual({ branch: "master", bytes });

    expect(state.fetchWithTimeout).toHaveBeenCalledTimes(2);
    const [mainUrl] = state.fetchWithTimeout.mock.calls[0] ?? [];
    const [masterUrl] = state.fetchWithTimeout.mock.calls[1] ?? [];
    expect(String(mainUrl)).toContain("/zip/refs/heads/main");
    expect(String(masterUrl)).toContain("/zip/refs/heads/master");
  });

  it("throws not_found when neither main nor master exists", async () => {
    state.fetchWithTimeout
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    const mod = await loadModule();
    await expect(
      mod.downloadGithubRepoZip({ owner: "vercel-labs", repo: "skills" }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("throws upstream_failed for non-404 errors", async () => {
    state.fetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 500 });

    const mod = await loadModule();
    await expect(
      mod.downloadGithubRepoZip({ owner: "vercel-labs", repo: "skills" }),
    ).rejects.toMatchObject({ code: "upstream_failed", status: 502 });
  });

  it("requires archives to stay under the maximum size", async () => {
    const bytes = new Uint8Array(20_000_001);
    state.fetchWithTimeout.mockResolvedValueOnce(okZip(bytes));

    const mod = await loadModule();
    await expect(
      mod.downloadGithubRepoZip({ owner: "vercel-labs", repo: "skills" }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("adds Authorization header when GITHUB_TOKEN is configured", async () => {
    const bytes = new Uint8Array([1]);
    state.fetchWithTimeout.mockResolvedValueOnce(okZip(bytes));

    await withEnv({ GITHUB_TOKEN: "gh_token" }, async () => {
      const mod = await loadModule();
      await mod.downloadGithubRepoZip({ owner: "o", repo: "r" });

      const [, init] = state.fetchWithTimeout.mock.calls[0] ?? [];
      expect(init).toMatchObject({
        headers: { authorization: "Bearer gh_token" },
        method: "GET",
      });
    });
  });
});
