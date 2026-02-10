import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock("@/lib/net/fetch-with-timeout.server", () => ({
  fetchWithTimeout: (...args: unknown[]) => state.fetchWithTimeout(...args),
}));

async function loadModule() {
  vi.resetModules();
  return await import("@/lib/skills-registry/skills-sh-search.server");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("searchSkillsShRegistry", () => {
  it("requires a non-empty query", async () => {
    const mod = await loadModule();
    await expect(mod.searchSkillsShRegistry("   ")).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    });
  });

  it("clamps limit between 1 and 50", async () => {
    state.fetchWithTimeout.mockResolvedValueOnce({
      json: async () => ({
        count: 0,
        duration_ms: 1,
        query: "find",
        searchType: "skills",
        skills: [],
      }),
      ok: true,
      status: 200,
    });

    const mod = await loadModule();
    await mod.searchSkillsShRegistry("find", { limit: 999 });

    const [url] = state.fetchWithTimeout.mock.calls[0] ?? [];
    expect(typeof url).toBe("string");
    const parsed = new URL(String(url));
    expect(parsed.origin).toBe("https://skills.sh");
    expect(parsed.pathname).toBe("/api/search");
    expect(parsed.searchParams.get("q")).toBe("find");
    expect(parsed.searchParams.get("limit")).toBe("50");
  });

  it("throws upstream_failed when skills.sh responds with an error status", async () => {
    state.fetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 503 });

    const mod = await loadModule();
    await expect(mod.searchSkillsShRegistry("find")).rejects.toMatchObject({
      code: "upstream_failed",
      status: 502,
    });
  });

  it("throws upstream_failed when the response payload cannot be parsed", async () => {
    state.fetchWithTimeout.mockResolvedValueOnce({
      json: async () => ({ ok: true }),
      ok: true,
      status: 200,
    });

    const mod = await loadModule();
    await expect(mod.searchSkillsShRegistry("find")).rejects.toMatchObject({
      code: "upstream_failed",
      status: 502,
    });
  });

  it("returns the parsed response on success", async () => {
    state.fetchWithTimeout.mockResolvedValueOnce({
      json: async () => ({
        count: 1,
        duration_ms: 1,
        query: "find",
        searchType: "skills",
        skills: [
          {
            id: "vercel-labs/skills/find-skills",
            installs: 123,
            name: "find-skills",
            skillId: "find-skills",
            source: "vercel-labs/skills",
          },
        ],
      }),
      ok: true,
      status: 200,
    });

    const mod = await loadModule();
    await expect(mod.searchSkillsShRegistry("find")).resolves.toMatchObject({
      count: 1,
      query: "find",
      skills: [
        {
          id: "vercel-labs/skills/find-skills",
          installs: 123,
          name: "find-skills",
          skillId: "find-skills",
          source: "vercel-labs/skills",
        },
      ],
    });
  });
});
