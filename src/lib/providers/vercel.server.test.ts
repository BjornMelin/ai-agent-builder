import { withEnv } from "@tests/utils/env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const sdkState = vi.hoisted(() => ({
  createDeploymentImpl: null as null | ((input: unknown) => Promise<unknown>),
  createProjectEnvImpl: null as null | ((input: unknown) => Promise<unknown>),
  createProjectImpl: null as null | ((input: unknown) => Promise<unknown>),
  deployments: new Map<
    string,
    Readonly<{
      alias?: string[];
      errorMessage?: string;
      id: string;
      projectId?: string;
      readyState?: string;
      readyStateReason?: string;
      status?: string;
      target?: string | null;
      url?: string | null;
    }>
  >(),
  getDeploymentImpl: null as null | ((input: unknown) => Promise<unknown>),
  lastCreateDeploymentInput: null as null | unknown,
  projects: [] as Array<{
    id: string;
    name: string;
    link?: unknown;
  }>,
  returnArrayFromGetProjects: false,
}));

class FakeVercel {
  public projects = {
    createProject: vi.fn(async (input: unknown) => {
      if (sdkState.createProjectImpl) {
        return await sdkState.createProjectImpl(input);
      }
      const name =
        input && typeof input === "object"
          ? String(
              (input as { requestBody?: { name?: unknown } }).requestBody
                ?.name ?? "",
            )
          : "";
      const created = {
        id: `proj_${sdkState.projects.length + 1}`,
        link: {
          org: "acme",
          productionBranch: "main",
          repo: "repo",
          type: "github",
        },
        name,
      };
      sdkState.projects.push(created);
      return created;
    }),
    createProjectEnv: vi.fn(async (input: unknown) => {
      if (sdkState.createProjectEnvImpl) {
        return await sdkState.createProjectEnvImpl(input);
      }
      const vars =
        input && typeof input === "object"
          ? ((input as { requestBody?: unknown }).requestBody as unknown)
          : undefined;
      const created = Array.isArray(vars)
        ? vars.map((v, idx) => ({
            ...(typeof v === "object" && v !== null ? v : {}),
            // The real API returns `value` in the response; we must ensure our code does not expose it.
            id: `env_${idx + 1}`,
            value: "super_secret_value",
          }))
        : {
            ...(typeof vars === "object" && vars !== null ? vars : {}),
            id: "env_1",
            value: "super_secret_value",
          };

      return {
        created,
        failed: [],
      };
    }),
    getProjects: vi.fn(async (_request: unknown) => {
      if (sdkState.returnArrayFromGetProjects) {
        return sdkState.projects;
      }
      return {
        pagination: { count: 1, next: null, prev: null },
        projects: sdkState.projects,
      };
    }),
  };

  public deployments = {
    createDeployment: vi.fn(async (input: unknown) => {
      sdkState.lastCreateDeploymentInput = input;
      if (sdkState.createDeploymentImpl) {
        return await sdkState.createDeploymentImpl(input);
      }
      const projectId =
        input && typeof input === "object"
          ? String(
              (input as { requestBody?: { project?: unknown } }).requestBody
                ?.project ?? "",
            )
          : "";
      return {
        alias: [],
        createdAt: Date.now(),
        id: "dpl_1",
        inspectorUrl: null,
        name: "deploy",
        projectId,
        readyState: "BUILDING",
        status: "BUILDING",
        target: null,
        url: "example.vercel.app",
      };
    }),
    getDeployment: vi.fn(async (input: unknown) => {
      if (sdkState.getDeploymentImpl) {
        return await sdkState.getDeploymentImpl(input);
      }
      const id =
        input && typeof input === "object"
          ? String((input as { idOrUrl?: unknown }).idOrUrl ?? "")
          : "";
      const found = sdkState.deployments.get(id);
      if (!found) {
        return {
          alias: [],
          id,
          projectId: null,
          readyState: "BUILDING",
          status: "BUILDING",
          target: null,
          url: null,
        };
      }
      return found;
    }),
  };
}

vi.mock("@vercel/sdk", () => ({
  Vercel: FakeVercel,
}));

async function loadVercelProvider() {
  vi.resetModules();
  return await import("@/lib/providers/vercel.server");
}

describe("vercel provider", () => {
  beforeEach(() => {
    sdkState.projects.length = 0;
    sdkState.deployments.clear();
    sdkState.createProjectImpl = null;
    sdkState.createProjectEnvImpl = null;
    sdkState.createDeploymentImpl = null;
    sdkState.getDeploymentImpl = null;
    sdkState.returnArrayFromGetProjects = false;
    sdkState.lastCreateDeploymentInput = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns null client when VERCEL_TOKEN is missing", async () => {
    await withEnv({ VERCEL_TOKEN: undefined }, async () => {
      const mod = await loadVercelProvider();
      await expect(mod.getVercelClientOrNull()).resolves.toBeNull();
    });
  });

  it("ensureProject throws env_invalid when VERCEL_TOKEN is missing", async () => {
    await withEnv({ VERCEL_TOKEN: undefined }, async () => {
      const mod = await loadVercelProvider();
      await expect(mod.ensureProject({ name: "demo" })).rejects.toMatchObject({
        code: "env_invalid",
      });
    });
  });

  it("ensureProject returns existing project when found by name", async () => {
    sdkState.projects.push({
      id: "proj_existing",
      link: {
        org: "acme",
        productionBranch: "main",
        repo: "repo",
        type: "github",
      },
      name: "demo",
    });

    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      const result = await mod.ensureProject({
        gitHubRepo: { owner: "acme", repo: "repo" },
        name: "demo",
      });
      expect(result.created).toBe(false);
      expect(result.projectId).toBe("proj_existing");
    });
  });

  it("ensureProject rejects empty names", async () => {
    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      await expect(mod.ensureProject({ name: "   " })).rejects.toMatchObject({
        code: "bad_request",
        status: 400,
      } satisfies Partial<AppError>);
    });
  });

  it("ensureProject throws conflict when existing project is missing GitHub link", async () => {
    sdkState.projects.push({
      id: "proj_existing",
      link: null,
      name: "demo",
    });

    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      await expect(
        mod.ensureProject({
          gitHubRepo: { owner: "acme", repo: "repo" },
          name: "demo",
        }),
      ).rejects.toMatchObject({
        code: "conflict",
        status: 409,
      } satisfies Partial<AppError>);
    });
  });

  it("ensureProject throws conflict when existing project is linked to a different repo", async () => {
    sdkState.projects.push({
      id: "proj_existing",
      link: {
        org: "other",
        productionBranch: "main",
        repo: "repo",
        type: "github",
      },
      name: "demo",
    });

    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      await expect(
        mod.ensureProject({
          gitHubRepo: { owner: "acme", repo: "repo" },
          name: "demo",
        }),
      ).rejects.toMatchObject({
        code: "conflict",
        status: 409,
      } satisfies Partial<AppError>);
    });
  });

  it("ensureProject creates a new project (and supports array-form list responses)", async () => {
    sdkState.returnArrayFromGetProjects = true;

    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      const res = await mod.ensureProject({ name: "new-project" });
      expect(res.created).toBe(true);
      expect(res.projectId).toMatch(/^proj_/);
      expect(res.gitHub?.provider).toBe("github");
    });
  });

  it("ensureProject retries listing when creation fails (concurrent create)", async () => {
    sdkState.createProjectImpl = async (input: unknown) => {
      const name =
        input && typeof input === "object"
          ? String(
              (input as { requestBody?: { name?: unknown } }).requestBody
                ?.name ?? "",
            )
          : "";
      sdkState.projects.push({
        id: "proj_concurrent",
        link: {
          org: "acme",
          productionBranch: "main",
          repo: "repo",
          type: "github",
        },
        name,
      });
      throw new Error("race");
    };

    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      const res = await mod.ensureProject({ name: "demo" });
      expect(res.created).toBe(false);
      expect(res.projectId).toBe("proj_concurrent");
    });
  });

  it("ensureProject rethrows AppError from createProject", async () => {
    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      const { AppError: CurrentAppError } = await import("@/lib/core/errors");
      sdkState.createProjectImpl = async () => {
        throw new CurrentAppError("conflict", 409, "nope");
      };
      await expect(mod.ensureProject({ name: "demo" })).rejects.toMatchObject({
        code: "conflict",
        status: 409,
      } satisfies Partial<AppError>);
    });
  });

  it("upsertEnvVars does not leak env var values in its return", async () => {
    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();

      const res = await mod.upsertEnvVars({
        envVars: [
          {
            key: "DATABASE_URL",
            targets: ["production"],
            type: "encrypted",
            value: "postgresql://secret",
          },
        ],
        projectId: "proj_1",
      });

      // Our contract: the response must not include values.
      expect(JSON.stringify(res)).not.toContain("postgresql://secret");
      expect(res.created.at(0)?.key).toBe("DATABASE_URL");
    });
  });

  it("upsertEnvVars returns empty result when no env vars are provided", async () => {
    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      await expect(
        mod.upsertEnvVars({ envVars: [], projectId: "proj_1" }),
      ).resolves.toEqual({ created: [], failed: [] });
    });
  });

  it("upsertEnvVars normalizes targets, supports object-form created, and maps failures", async () => {
    sdkState.createProjectEnvImpl = async () => ({
      created: {
        comment: "",
        gitBranch: null,
        id: "env_1",
        key: "K",
        target: ["preview", "nope", "production"],
        type: "encrypted",
        value: "super_secret_value",
      },
      failed: [
        { error: { code: "bad", key: "A" } },
        { error: { code: "bad2", envVarKey: "B" } },
        { error: { code: "bad3" } },
      ],
    });

    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      const res = await mod.upsertEnvVars({
        envVars: [
          {
            key: "K",
            targets: ["preview", "production"],
            value: "secret",
          },
        ],
        projectId: "proj_1",
      });

      expect(res.created).toEqual([
        expect.objectContaining({
          key: "K",
          targets: ["preview", "production"],
        }),
      ]);
      expect(res.failed).toEqual([
        { code: "bad", key: "A" },
        { code: "bad2", key: "B" },
        { code: "bad3", key: null },
      ]);
    });
  });

  it("upsertEnvVars throws bad_gateway when the Vercel SDK call fails (and does not leak secrets)", async () => {
    sdkState.createProjectEnvImpl = async () => {
      throw new Error("sdk down");
    };

    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      await expect(
        mod.upsertEnvVars({
          envVars: [
            {
              key: "DATABASE_URL",
              targets: ["production"],
              value: "super_secret",
            },
          ],
          projectId: "proj_1",
        }),
      ).rejects.toMatchObject({
        code: "bad_gateway",
        status: 502,
      } satisfies Partial<AppError>);
    });
  });

  it("createDeployment returns deployment refs and includes target/sha/meta when set", async () => {
    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();

      const res = await mod.createDeployment({
        gitHub: { owner: "acme", ref: "main", repo: "repo", sha: "deadbeef" },
        meta: { runId: "run_1" },
        name: "demo",
        projectId: "proj_1",
        target: "production",
      });

      expect(res.deploymentId).toBe("dpl_1");
      expect(sdkState.lastCreateDeploymentInput).toMatchObject({
        requestBody: expect.objectContaining({
          gitSource: expect.objectContaining({ sha: "deadbeef" }),
          meta: { runId: "run_1" },
          target: "production",
        }),
      });
    });
  });

  it("createDeployment wraps non-AppError failures as bad_gateway", async () => {
    sdkState.createDeploymentImpl = async () => {
      throw new Error("boom");
    };

    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      await expect(
        mod.createDeployment({
          gitHub: { owner: "acme", ref: "main", repo: "repo" },
          name: "demo",
          projectId: "proj_1",
        }),
      ).rejects.toMatchObject({
        code: "bad_gateway",
        status: 502,
      } satisfies Partial<AppError>);
    });
  });

  it("pollDeployment returns a terminal result when readyState is terminal", async () => {
    sdkState.deployments.set("dpl_ready", {
      alias: ["demo.vercel.app"],
      errorMessage: "",
      id: "dpl_ready",
      projectId: "proj_1",
      readyState: "READY",
      readyStateReason: "ok",
      status: "READY",
      target: "preview",
      url: "demo.vercel.app",
    });

    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      const res = await mod.pollDeployment({
        deploymentId: "dpl_ready",
        intervalMs: 0,
        timeoutMs: 10,
      });

      expect(res.kind).toBe("terminal");
      expect(res.readyState).toBe("READY");
      expect(res.alias).toEqual(["demo.vercel.app"]);
    });
  });

  it("pollDeployment returns timeout and normalizes nullable fields", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    sdkState.getDeploymentImpl = async (input: unknown) => {
      const id =
        input && typeof input === "object"
          ? String((input as { idOrUrl?: unknown }).idOrUrl ?? "")
          : "";
      return {
        alias: [],
        errorMessage: "",
        id,
        projectId: 123,
        readyState: "BUILDING",
        status: "BUILDING",
        target: null,
        url: null,
      };
    };

    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      const promise = mod.pollDeployment({
        deploymentId: "dpl_1",
        intervalMs: 1000,
        timeoutMs: 2500,
      });

      await vi.advanceTimersByTimeAsync(3000);
      const res = await promise;

      expect(res.kind).toBe("timeout");
      expect(res.projectId).toBe("123");
      expect(res.readyStateReason).toBeNull();
      expect(res.errorMessage).toBeNull();
    });
  });

  it("pollDeployment returns default timeout shape when the timeout elapses before the first poll", async () => {
    const spy = vi
      .spyOn(Date, "now")
      .mockImplementationOnce(() => 0)
      .mockImplementation(() => 2);

    await withEnv({ VERCEL_TOKEN: "vercel_test_token" }, async () => {
      const mod = await loadVercelProvider();
      const res = await mod.pollDeployment({
        deploymentId: "dpl_never",
        intervalMs: 1,
        timeoutMs: 1,
      });

      expect(res.kind).toBe("timeout");
      expect(res.deploymentId).toBe("dpl_never");
      expect(res.url).toBeNull();
    });

    spy.mockRestore();
  });
});
