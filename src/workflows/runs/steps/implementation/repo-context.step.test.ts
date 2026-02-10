import { installImplementationRunHarness } from "@tests/utils/implementation-run-harness";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = installImplementationRunHarness();
const { state } = harness;

beforeEach(() => {
  vi.clearAllMocks();
  harness.reset();
});

describe("ensureImplementationRepoContext", () => {
  it("throws not_found when project is missing", async () => {
    state.getDb.mockReturnValueOnce({
      query: {
        projectsTable: { findFirst: vi.fn(async () => null) },
        reposTable: { findFirst: vi.fn(async () => null) },
      },
    });

    const { ensureImplementationRepoContext } = await import(
      "./repo-context.step"
    );
    await expect(
      ensureImplementationRepoContext({ projectId: "proj_1", runId: "run_1" }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("throws conflict when no repository is connected", async () => {
    state.getDb.mockReturnValueOnce({
      query: {
        projectsTable: {
          findFirst: vi.fn(async () => ({ name: "Project", slug: "project" })),
        },
        reposTable: { findFirst: vi.fn(async () => null) },
      },
    });

    const { ensureImplementationRepoContext } = await import(
      "./repo-context.step"
    );
    await expect(
      ensureImplementationRepoContext({ projectId: "proj_1", runId: "run_1" }),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
  });

  it("returns repo context with a deterministic branch name", async () => {
    const { ensureImplementationRepoContext } = await import(
      "./repo-context.step"
    );
    await expect(
      ensureImplementationRepoContext({ projectId: "proj_1", runId: "run_1" }),
    ).resolves.toMatchObject({
      branchName: "agent/project/run_1",
      repoKind: "node",
    });
  });
});
