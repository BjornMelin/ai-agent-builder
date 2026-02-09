import { describe, expect, it, vi } from "vitest";

type ArtifactExportBasePathArgs = {
  kind: string;
  logicalKey: string;
  version: number;
};

type ImplementationAuditBundleBlobPathArgs = {
  projectId: string;
  runId: string;
};

const state = vi.hoisted(() => ({
  buildExportZipBytes: vi.fn(),
  createArtifactVersion: vi.fn(),
  getDb: vi.fn(),
  listCitationsByArtifactIds: vi.fn(),
  listDeploymentsByProject: vi.fn(),
  listReposByProject: vi.fn(),
  listRunSteps: vi.fn(),
  listSandboxJobsByRun: vi.fn(),
  putImplementationAuditBundleBlob: vi.fn(),
}));

vi.mock("@/lib/data/artifacts.server", () => ({
  createArtifactVersion: state.createArtifactVersion,
}));

vi.mock("@/lib/export/zip.server", () => ({
  artifactExportBasePath: ({
    kind,
    logicalKey,
    version,
  }: ArtifactExportBasePathArgs) => `${kind}/${logicalKey}.v${version}`,
  buildExportZipBytes: state.buildExportZipBytes,
}));

vi.mock("@/lib/export/implementation-audit-bundle-blob.server", () => ({
  getImplementationAuditBundleBlobPath: ({
    projectId,
    runId,
  }: ImplementationAuditBundleBlobPathArgs) =>
    `projects/${projectId}/runs/${runId}/audit/implementation-audit-bundle.zip`,
  putImplementationAuditBundleBlob: state.putImplementationAuditBundleBlob,
}));

vi.mock("@/lib/data/runs.server", () => ({
  listRunSteps: state.listRunSteps,
}));

vi.mock("@/lib/data/sandbox-jobs.server", () => ({
  listSandboxJobsByRun: state.listSandboxJobsByRun,
}));

vi.mock("@/lib/data/repos.server", () => ({
  listReposByProject: state.listReposByProject,
}));

vi.mock("@/lib/data/deployments.server", () => ({
  listDeploymentsByProject: state.listDeploymentsByProject,
}));

vi.mock("@/lib/data/citations.server", () => ({
  listCitationsByArtifactIds: state.listCitationsByArtifactIds,
}));

vi.mock("@/lib/artifacts/content.server", () => ({
  getMarkdownContent: () => null,
}));

vi.mock("@/db/client", () => ({
  getDb: state.getDb,
}));

describe("createImplementationAuditBundleArtifact", () => {
  it("uploads a deterministic zip and stores an artifact pointing at the blob", async () => {
    const db = {
      query: {
        approvalsTable: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        artifactsTable: {
          findMany: vi.fn().mockResolvedValue([
            {
              content: { format: "json", value: 1 },
              createdAt: new Date("2026-02-01T00:00:00.000Z"),
              id: "art_1",
              kind: "RUN_SUMMARY",
              logicalKey: "run:run_1",
              projectId: "proj_1",
              runId: "run_1",
              version: 1,
            },
          ]),
        },
        deploymentsTable: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        projectsTable: {
          findFirst: vi.fn().mockResolvedValue({
            id: "proj_1",
            name: "Project",
            slug: "project",
          }),
        },
        runStepsTable: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        runsTable: {
          findFirst: vi.fn().mockResolvedValue({
            createdAt: new Date("2026-02-01T00:00:00.000Z"),
            id: "run_1",
            kind: "implementation",
            metadata: {},
            projectId: "proj_1",
            status: "succeeded",
            updatedAt: new Date("2026-02-01T00:00:00.000Z"),
            workflowRunId: "wf_1",
          }),
        },
        sandboxJobsTable: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    };

    state.getDb.mockReturnValue(db);
    state.listRunSteps.mockResolvedValue([]);
    state.listSandboxJobsByRun.mockResolvedValue([]);
    state.listReposByProject.mockResolvedValue([]);
    state.listDeploymentsByProject.mockResolvedValue([]);
    state.listCitationsByArtifactIds.mockResolvedValue([]);

    state.buildExportZipBytes.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      manifest: {
        entries: [],
        project: { id: "proj_1", name: "Project", slug: "project" },
        version: 1,
      },
    });

    state.putImplementationAuditBundleBlob.mockResolvedValue(
      "https://blob.example/audit.zip",
    );

    state.createArtifactVersion.mockResolvedValue({
      id: "art_audit",
      kind: "IMPLEMENTATION_AUDIT_BUNDLE",
      logicalKey: "run:run_1",
      projectId: "proj_1",
      runId: "run_1",
      version: 1,
    });

    const { createImplementationAuditBundleArtifact } = await import(
      "@/workflows/runs/steps/artifacts.step"
    );

    const res = await createImplementationAuditBundleArtifact({
      projectId: "proj_1",
      runId: "run_1",
    });

    expect(res).toMatchObject({
      artifactId: "art_audit",
      blobUrl: "https://blob.example/audit.zip",
      version: 1,
    });

    expect(state.putImplementationAuditBundleBlob).toHaveBeenCalledWith(
      expect.objectContaining({
        blobPath:
          "projects/proj_1/runs/run_1/audit/implementation-audit-bundle.zip",
      }),
    );
    expect(state.createArtifactVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "IMPLEMENTATION_AUDIT_BUNDLE",
        logicalKey: "run:run_1",
        projectId: "proj_1",
        runId: "run_1",
      }),
    );
  });
});
