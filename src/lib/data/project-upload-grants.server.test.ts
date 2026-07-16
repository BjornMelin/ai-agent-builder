import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  deleteWhere: vi.fn(),
  execute: vi.fn(),
  getDb: vi.fn(),
  grantFindFirst: vi.fn(),
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
  projectFindFirst: vi.fn(),
  transaction: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  withActiveProjectLease: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: () => state.getDb(),
}));

vi.mock("@/lib/projects/project-lifecycle-lease.server", () => ({
  withActiveProjectLease: state.withActiveProjectLease,
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const grantId = "22222222-2222-4222-8222-222222222222";

function createFakeDb() {
  const tx = {
    delete: vi.fn(() => ({ where: state.deleteWhere })),
    execute: state.execute,
    insert: vi.fn(() => ({ values: state.insertValues })),
    query: {
      projectsTable: { findFirst: state.projectFindFirst },
      projectUploadGrantsTable: { findFirst: state.grantFindFirst },
    },
    update: vi.fn(() => ({ set: state.updateSet })),
  };
  state.insertValues.mockReturnValue({ returning: state.insertReturning });
  state.updateSet.mockReturnValue({ where: state.updateWhere });
  state.transaction.mockImplementation(
    async (work: (client: typeof tx) => Promise<unknown>) => await work(tx),
  );
  return { ...tx, transaction: state.transaction };
}

beforeEach(() => {
  vi.clearAllMocks();
  const db = createFakeDb();
  state.getDb.mockReturnValue(db);
  state.withActiveProjectLease.mockImplementation(
    async (_input: unknown, work: (client: typeof db) => Promise<unknown>) =>
      await work(db),
  );
  state.execute.mockResolvedValue(undefined);
  state.insertReturning.mockResolvedValue([{ id: grantId }]);
  state.deleteWhere.mockResolvedValue(undefined);
  state.updateWhere.mockResolvedValue(undefined);
  state.projectFindFirst.mockResolvedValue({ status: "active" });
  state.grantFindFirst.mockResolvedValue({ id: grantId });
});

describe("project upload grants", () => {
  it("commits a durable grant under the exact-owner active-project lease", async () => {
    const { issueProjectUploadGrant } = await import(
      "@/lib/data/project-upload-grants.server"
    );
    const expiresAt = new Date("2026-07-16T16:00:00.000Z");

    await expect(
      issueProjectUploadGrant({
        expiresAt,
        pathname: `projects/${projectId}/uploads/report.pdf`,
        projectId,
        userId: "user_1",
      }),
    ).resolves.toEqual({ id: grantId });

    expect(state.withActiveProjectLease).toHaveBeenCalledWith(
      { projectId, userId: "user_1" },
      expect.any(Function),
    );
    expect(state.insertValues).toHaveBeenCalledWith({
      expiresAt,
      pathname: `projects/${projectId}/uploads/report.pdf`,
      projectId,
    });
  });

  it("settles an active project's signed completion under the lifecycle lock", async () => {
    const { resolveProjectUploadCompletion } = await import(
      "@/lib/data/project-upload-grants.server"
    );

    await expect(
      resolveProjectUploadCompletion({
        grantId,
        projectId,
      }),
    ).resolves.toBe("keep");

    expect(state.execute).toHaveBeenCalledOnce();
    expect(state.updateSet).toHaveBeenCalledWith({
      completedAt: expect.any(Date),
    });
  });

  it("requires provider deletion when the project is no longer active", async () => {
    state.projectFindFirst.mockResolvedValueOnce({ status: "deleting" });
    const { resolveProjectUploadCompletion } = await import(
      "@/lib/data/project-upload-grants.server"
    );

    await expect(
      resolveProjectUploadCompletion({
        grantId,
        projectId,
      }),
    ).resolves.toBe("delete");
    expect(state.updateSet).not.toHaveBeenCalled();
  });

  it("keeps deletion pending while an unexpired upload grant exists", async () => {
    state.grantFindFirst.mockResolvedValueOnce({
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { assertProjectUploadGrantsSettled } = await import(
      "@/lib/data/project-upload-grants.server"
    );

    await expect(
      assertProjectUploadGrantsSettled(projectId),
    ).rejects.toMatchObject({ code: "project_uploads_pending", status: 409 });
    expect(state.deleteWhere).toHaveBeenCalledOnce();
  });

  it("allows the final prefix sweep after completed and expired grants are pruned", async () => {
    state.grantFindFirst.mockResolvedValueOnce(undefined);
    const { assertProjectUploadGrantsSettled } = await import(
      "@/lib/data/project-upload-grants.server"
    );

    await expect(
      assertProjectUploadGrantsSettled(projectId),
    ).resolves.toBeUndefined();
    expect(state.execute).toHaveBeenCalledOnce();
    expect(state.deleteWhere).toHaveBeenCalledOnce();
  });
});
