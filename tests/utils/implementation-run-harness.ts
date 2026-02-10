import { vi } from "vitest";

function createHarnessState() {
  return {
    attachSandboxJobSession: vi.fn(),
    createGateway: vi.fn(),
    createOrGetPullRequest: vi.fn(),
    detectGitHubRepoRuntimeKind: vi.fn(),
    env: {
      aiGateway: {
        apiKey: "key",
        baseUrl: "https://ai-gateway.example.com",
        chatModel: "openai/gpt-4o",
      },
      github: {
        token: "token",
      },
      sandbox: {
        auth: "oidc" as "oidc" | "token",
        projectId: "proj",
        teamId: "team",
        token: "vercel-token",
      },
    },
    getDb: vi.fn(),
    getVercelSandbox: vi.fn(),
    startSandboxJobSession: vi.fn(),
  };
}

export type ImplementationRunHarnessState = ReturnType<
  typeof createHarnessState
>;

export type ImplementationRunHarness = Readonly<{
  reset: () => void;
  state: ImplementationRunHarnessState;
}>;

/**
 * Install module mocks for implementation-step unit tests.
 *
 * @remarks
 * Uses `vi.doMock` (not hoisted) so this helper can live in `tests/utils/`
 * without relying on `vi.hoisted()` exports (which Vitest forbids).
 *
 * Call this before importing the step module under test.
 *
 * @returns Installed harness with `state` and a `reset()` helper.
 */
export function installImplementationRunHarness(): ImplementationRunHarness {
  const state = createHarnessState();

  vi.doMock("@/lib/env", () => ({
    env: state.env,
  }));

  vi.doMock("@/lib/ai/skills/index.server", () => ({
    listAvailableSkillsForProject: async () => [],
    loadSkillForProject: async () => ({
      error: "Skill not available.",
      ok: false,
    }),
    readSkillFileForProject: async () => ({
      error: "Skill file not available.",
      ok: false,
    }),
  }));

  vi.doMock("@/db/client", () => ({
    getDb: () => state.getDb(),
  }));

  vi.doMock("@/lib/repo/repo-kind.server", () => ({
    detectGitHubRepoRuntimeKind: (...args: unknown[]) =>
      state.detectGitHubRepoRuntimeKind(...args),
    detectGitHubRepoRuntimeKindStrict: (...args: unknown[]) =>
      state.detectGitHubRepoRuntimeKind(...args),
  }));

  vi.doMock("@/lib/repo/repo-ops.server", () => ({
    createOrGetPullRequest: (...args: unknown[]) =>
      state.createOrGetPullRequest(...args),
  }));

  vi.doMock("@/lib/sandbox/sandbox-runner.server", () => ({
    attachSandboxJobSession: (...args: unknown[]) =>
      state.attachSandboxJobSession(...args),
    startSandboxJobSession: (...args: unknown[]) =>
      state.startSandboxJobSession(...args),
  }));

  vi.doMock("@/lib/sandbox/sandbox-client.server", () => ({
    getVercelSandbox: (...args: unknown[]) => state.getVercelSandbox(...args),
  }));

  vi.doMock("ai", async (importOriginal) => {
    const mod = await importOriginal<typeof import("ai")>();
    return {
      ...mod,
      createGateway: (...args: unknown[]) => state.createGateway(...args),
    };
  });

  const reset = () => {
    state.env.github.token = "token";

    state.detectGitHubRepoRuntimeKind.mockResolvedValue({
      evidence: {
        hasPackageJson: true,
        hasPyprojectToml: false,
        hasRequirementsTxt: false,
      },
      kind: "node",
    });

    state.getDb.mockReturnValue({
      query: {
        projectsTable: {
          findFirst: vi.fn(async () => ({ name: "Project", slug: "project" })),
        },
        reposTable: {
          findFirst: vi.fn(async () => ({
            cloneUrl: "https://example.com/repo.git",
            defaultBranch: "main",
            htmlUrl: "https://example.com/repo",
            id: "repo_1",
            name: "repo",
            owner: "owner",
            provider: "github",
          })),
        },
      },
    });

    state.createOrGetPullRequest.mockResolvedValue({
      baseRef: "main",
      headRef: "agent/project/run_1",
      htmlUrl: "https://example.com/pr/1",
      number: 1,
      title: "PR",
    });

    state.getVercelSandbox.mockResolvedValue({
      stop: vi.fn(async () => {}),
    });
  };

  reset();

  return { reset, state };
}
