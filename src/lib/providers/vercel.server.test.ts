import { describe, expect, it, vi } from "vitest";

type EnvOverrides = Readonly<Record<string, string | undefined>>;

async function withEnv<T>(
  overrides: EnvOverrides,
  fn: () => Promise<T>,
): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

const sdkState = vi.hoisted(() => ({
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
  projects: [] as Array<{
    id: string;
    name: string;
    link?: unknown;
  }>,
}));

class FakeVercel {
  public projects = {
    createProject: vi.fn(async (input: unknown) => {
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
    getProjects: vi.fn(async (_request: unknown) => ({
      pagination: { count: 1, next: null, prev: null },
      projects: sdkState.projects,
    })),
  };

  public deployments = {
    createDeployment: vi.fn(async (input: unknown) => {
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
    sdkState.projects.length = 0;
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

  it("upsertEnvVars does not leak env var values in its return", async () => {
    sdkState.projects.length = 0;

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
});
