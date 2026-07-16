import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  execute: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      await callback({
        execute: state.execute,
        query: { projectsTable: { findFirst: state.findFirst } },
      }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.execute.mockResolvedValue(undefined);
  state.findFirst.mockResolvedValue({
    ownerUserId: "user_1",
    status: "active",
  });
});

describe("withActiveProjectLease", () => {
  it("runs a producer only after acquiring the project lifecycle lock", async () => {
    const work = vi.fn().mockResolvedValue("committed");
    const { withActiveProjectLease } = await import(
      "@/lib/projects/project-lifecycle-lease.server"
    );

    await expect(
      withActiveProjectLease({ projectId: "proj_1", userId: "user_1" }, work),
    ).resolves.toBe("committed");
    expect(state.execute).toHaveBeenCalledOnce();
    expect(state.findFirst).toHaveBeenCalledOnce();
    expect(work).toHaveBeenCalledOnce();
  });

  it("rejects archived and deletion-pending projects before producer work", async () => {
    const work = vi.fn();
    const { withActiveProjectLease } = await import(
      "@/lib/projects/project-lifecycle-lease.server"
    );

    for (const status of ["archived", "deleting"]) {
      state.findFirst.mockResolvedValueOnce({
        ownerUserId: "user_1",
        status,
      });
      await expect(
        withActiveProjectLease({ projectId: "proj_1", userId: "user_1" }, work),
      ).rejects.toMatchObject({ code: "project_not_active", status: 409 });
    }
    expect(work).not.toHaveBeenCalled();
  });

  it("never treats a missing or differently owned project as writable", async () => {
    state.findFirst.mockResolvedValueOnce(undefined);
    const work = vi.fn();
    const { withActiveProjectLease } = await import(
      "@/lib/projects/project-lifecycle-lease.server"
    );

    await expect(
      withActiveProjectLease(
        { projectId: "proj_1", userId: "another_user" },
        work,
      ),
    ).rejects.toMatchObject({ code: "project_not_found", status: 404 });
    expect(work).not.toHaveBeenCalled();
  });
});
