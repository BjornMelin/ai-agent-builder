import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";

type DbQueryMock = Readonly<{
  approvalsTable: Readonly<{ findMany: ReturnType<typeof vi.fn> }>;
  artifactsTable: Readonly<{ findMany: ReturnType<typeof vi.fn> }>;
  deploymentsTable: Readonly<{ findMany: ReturnType<typeof vi.fn> }>;
  projectsTable: Readonly<{ findFirst: ReturnType<typeof vi.fn> }>;
  reposTable: Readonly<{ findFirst: ReturnType<typeof vi.fn> }>;
  runStepsTable: Readonly<{ findMany: ReturnType<typeof vi.fn> }>;
  runsTable: Readonly<{ findFirst: ReturnType<typeof vi.fn> }>;
  sandboxJobsTable: Readonly<{ findMany: ReturnType<typeof vi.fn> }>;
}>;

const state = vi.hoisted(() => ({
  buildZip: vi.fn(),
  db: {
    query: {
      approvalsTable: { findMany: vi.fn() },
      artifactsTable: { findMany: vi.fn() },
      deploymentsTable: { findMany: vi.fn() },
      projectsTable: { findFirst: vi.fn() },
      reposTable: { findFirst: vi.fn() },
      runStepsTable: { findMany: vi.fn() },
      runsTable: { findFirst: vi.fn() },
      sandboxJobsTable: { findMany: vi.fn() },
    } satisfies DbQueryMock,
  },
  putBlob: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: () => state.db,
}));

vi.mock("@/lib/export/implementation-audit-bundle-blob.server", () => ({
  getImplementationAuditBundleBlobPath: (input: {
    projectId: string;
    runId: string;
  }) =>
    `projects/${input.projectId}/runs/${input.runId}/audit/implementation-audit-bundle.zip`,
  putImplementationAuditBundleBlob: (...args: unknown[]) =>
    state.putBlob(...args),
}));

vi.mock("@/lib/export/zip.server", () => ({
  buildExportZipBytes: (...args: unknown[]) => state.buildZip(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.buildZip.mockImplementation(async (input: { project: unknown }) => ({
    bytes: Uint8Array.from([1, 2, 3]),
    manifest: { entries: [], project: input.project, version: 1 as const },
  }));

  state.putBlob.mockResolvedValue({
    blobPath:
      "projects/proj_1/runs/run_1/audit/implementation-audit-bundle.zip-abc123",
    blobUrl: "https://blob.example/audit.zip",
  });

  state.db.query.projectsTable.findFirst.mockResolvedValue({
    id: "proj_1",
    name: "Project",
    slug: "project",
  });

  state.db.query.runsTable.findFirst.mockResolvedValue({
    createdAt: new Date("2026-02-09T00:00:00.000Z"),
    id: "run_1",
    kind: "implementation",
    metadata: {},
    projectId: "proj_1",
    status: "succeeded",
    updatedAt: new Date("2026-02-09T00:00:00.000Z"),
    workflowRunId: null,
  });

  state.db.query.runStepsTable.findMany.mockResolvedValue([
    {
      attempt: 0,
      createdAt: new Date("2026-02-09T00:00:00.000Z"),
      endedAt: null,
      error: null,
      id: "step_1",
      inputs: {},
      outputs: { repoId: "repo_1" },
      runId: "run_1",
      startedAt: new Date("2026-02-09T00:00:00.000Z"),
      status: "succeeded",
      stepId: "impl.repo.ensure",
      stepKind: "tool",
      stepName: "Ensure Repo",
      updatedAt: new Date("2026-02-09T00:00:00.000Z"),
    },
  ]);

  state.db.query.sandboxJobsTable.findMany.mockResolvedValue([
    {
      createdAt: new Date("2026-02-09T00:00:00.000Z"),
      endedAt: null,
      exitCode: null,
      id: "job_1",
      jobType: "sandbox_run",
      metadata: {},
      runId: "run_1",
      startedAt: null,
      status: "succeeded",
      transcriptBlobRef: null,
      updatedAt: new Date("2026-02-09T00:00:00.000Z"),
    },
  ]);

  state.db.query.approvalsTable.findMany.mockResolvedValue([]);
  state.db.query.deploymentsTable.findMany.mockResolvedValue([]);
  state.db.query.artifactsTable.findMany.mockResolvedValue([]);

  state.db.query.reposTable.findFirst.mockResolvedValue({
    cloneUrl: "https://example.com/repo.git",
    createdAt: new Date("2026-02-09T00:00:00.000Z"),
    defaultBranch: "main",
    htmlUrl: "https://example.com/repo",
    id: "repo_1",
    name: "repo",
    owner: "owner",
    provider: "github",
    updatedAt: new Date("2026-02-09T00:00:00.000Z"),
  });
});

async function loadModule() {
  return await import("@/lib/export/implementation-audit-bundle.server");
}

describe("collectImplementationAuditBundleDataFromDb", () => {
  it("throws not_found when project does not exist", async () => {
    state.db.query.projectsTable.findFirst.mockResolvedValueOnce(null);

    const { collectImplementationAuditBundleDataFromDb } = await loadModule();
    await expect(
      collectImplementationAuditBundleDataFromDb({
        projectId: "proj_x",
        runId: "run_1",
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<AppError>);
  });

  it("throws not_found when run does not exist", async () => {
    state.db.query.runsTable.findFirst.mockResolvedValueOnce(null);

    const { collectImplementationAuditBundleDataFromDb } = await loadModule();
    await expect(
      collectImplementationAuditBundleDataFromDb({
        projectId: "proj_1",
        runId: "run_x",
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<AppError>);
  });

  it("returns repo=null when the repoId output is missing", async () => {
    state.db.query.runStepsTable.findMany.mockResolvedValueOnce([
      {
        attempt: 0,
        createdAt: new Date("2026-02-09T00:00:00.000Z"),
        endedAt: null,
        error: null,
        id: "step_1",
        inputs: {},
        outputs: {},
        runId: "run_1",
        startedAt: null,
        status: "succeeded",
        stepId: "impl.repo.ensure",
        stepKind: "tool",
        stepName: "Ensure Repo",
        updatedAt: new Date("2026-02-09T00:00:00.000Z"),
      },
    ]);

    const { collectImplementationAuditBundleDataFromDb } = await loadModule();
    const result = await collectImplementationAuditBundleDataFromDb({
      projectId: "proj_1",
      runId: "run_1",
    });

    expect(result.repo).toBeNull();
    expect(state.db.query.reposTable.findFirst).not.toHaveBeenCalled();
  });

  it("resolves the repo from the ensure step outputs and serializes timestamps", async () => {
    const { collectImplementationAuditBundleDataFromDb } = await loadModule();
    const result = await collectImplementationAuditBundleDataFromDb({
      projectId: "proj_1",
      runId: "run_1",
    });

    expect(result.repo?.id).toBe("repo_1");
    expect(result.steps[0]?.startedAt).toBe("2026-02-09T00:00:00.000Z");
    expect(result.steps[0]?.endedAt).toBeNull();
    expect(result.sandboxJobs[0]?.exitCode).toBeNull();
    expect(result.sandboxJobs[0]?.transcriptBlobRef).toBeNull();
  });
});

describe("buildAndUploadImplementationAuditBundle", () => {
  it("uploads the bundle and returns sha256 + manifest metadata", async () => {
    const { buildAndUploadImplementationAuditBundle } = await loadModule();

    const result = await buildAndUploadImplementationAuditBundle({
      projectId: "proj_1",
      runId: "run_1",
    });

    expect(result.blobPath).toBe(
      "projects/proj_1/runs/run_1/audit/implementation-audit-bundle.zip-abc123",
    );
    expect(result.blobUrl).toBe("https://blob.example/audit.zip");
    expect(result.bytes).toBe(3);
    expect(result.sha256).toBe(sha256Hex(Uint8Array.from([1, 2, 3])));
    expect(result.manifest).toEqual({
      entries: [],
      project: { id: "proj_1", name: "Project", slug: "project" },
      version: 1,
    });
  });
});
