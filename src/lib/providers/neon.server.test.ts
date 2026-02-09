import { withEnv } from "@tests/utils/env";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";
import * as neonProvider from "@/lib/providers/neon.server";

const state = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

function jsonResponse(value: unknown, init?: Readonly<{ status?: number }>) {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status: init?.status ?? 200,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.fetch.mockReset();
  vi.unstubAllGlobals();
});

describe("neon provider", () => {
  it("returns a deterministic manual fallback when NEON_API_KEY is missing", async () => {
    await withEnv({ NEON_API_KEY: undefined }, async () => {
      const res = await neonProvider.ensureNeonProvisioning({
        projectSlug: "demo",
        runId: "run_1",
      });

      expect(res.kind).toBe("manual");
      expect(res.provider).toBe("neon");
      expect(res.artifact.title).toMatch(/manual neon provisioning/i);
      expect(res.artifact.steps.join("\n")).toMatch(/create a neon project/i);
    });
  });

  it("exposes resolveNeonProvisioning as a backwards-compatible alias", async () => {
    await withEnv({ NEON_API_KEY: undefined }, async () => {
      expect(neonProvider.resolveNeonProvisioning).toBe(
        neonProvider.ensureNeonProvisioning,
      );
    });
  });

  it("reuses an existing Neon project when found", async () => {
    await withEnv({ NEON_API_KEY: "neon_test_key" }, async () => {
      vi.stubGlobal("fetch", state.fetch);
      state.fetch.mockImplementationOnce(async (url: unknown) => {
        const u = new URL(String(url));
        const search = u.searchParams.get("search") ?? "";
        return jsonResponse({ projects: [{ id: "proj_1", name: search }] });
      });

      const res = await neonProvider.ensureNeonProvisioning({
        projectSlug: "demo",
        runId: "run_1",
      });

      expect(res).toMatchObject({
        kind: "automated",
        projectId: "proj_1",
        provider: "neon",
      });

      expect(state.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Bearer neon_test_key"),
          }),
          method: "GET",
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });

  it("creates a Neon project when no match is found", async () => {
    await withEnv({ NEON_API_KEY: "neon_test_key" }, async () => {
      vi.stubGlobal("fetch", state.fetch);
      state.fetch
        .mockResolvedValueOnce(jsonResponse({ projects: [] }))
        .mockImplementationOnce(async (_url: unknown, init: unknown) => {
          const body =
            init && typeof init === "object"
              ? (init as { body?: unknown }).body
              : undefined;
          const parsed =
            typeof body === "string"
              ? (JSON.parse(body) as unknown)
              : undefined;
          const name =
            parsed && typeof parsed === "object"
              ? String(
                  (parsed as { project?: { name?: unknown } }).project?.name ??
                    "",
                )
              : "";
          return jsonResponse({ project: { id: "proj_2", name } });
        });

      const res = await neonProvider.ensureNeonProvisioning({
        projectSlug: "demo",
        runId: "run_2",
      });

      expect(res).toMatchObject({
        kind: "automated",
        projectId: "proj_2",
        provider: "neon",
      });

      const calls = state.fetch.mock.calls.map((c) => String(c[0]));
      expect(calls.at(0)).toContain("/projects");
      expect(calls.at(1)).toContain("/projects");
    });
  });

  it("throws provider_auth_failed when Neon returns an auth error", async () => {
    await withEnv({ NEON_API_KEY: "neon_test_key" }, async () => {
      vi.stubGlobal("fetch", state.fetch);
      state.fetch.mockResolvedValueOnce(
        new Response("unauthorized", { status: 401 }),
      );

      await expect(
        neonProvider.ensureNeonProvisioning({
          projectSlug: "demo",
          runId: "run_1",
        }),
      ).rejects.toMatchObject({
        code: "provider_auth_failed",
        status: 502,
      } satisfies Partial<AppError>);
    });
  });

  it("throws provider_error when Neon returns an unexpected schema", async () => {
    await withEnv({ NEON_API_KEY: "neon_test_key" }, async () => {
      vi.stubGlobal("fetch", state.fetch);
      state.fetch.mockImplementation(async () => jsonResponse({ nope: true }));

      await expect(
        neonProvider.ensureNeonProvisioning({
          projectSlug: "demo",
          runId: "run_1",
        }),
      ).rejects.toMatchObject({
        code: "provider_error",
        status: 502,
      } satisfies Partial<AppError>);
    });
  });
});
