import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  insertReturning: vi.fn(),
  isUndefinedColumnError: vi.fn(),
  isUndefinedTableError: vi.fn(),
  updateReturning: vi.fn(),
  updateSet: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        returning: state.insertReturning,
      }),
    }),
    query: {
      sandboxJobsTable: {
        findFirst: state.findFirst,
        findMany: state.findMany,
      },
    },
    update: () => ({
      set: (values: unknown) => {
        state.updateSet(values);
        return {
          where: () => ({
            returning: state.updateReturning,
          }),
        };
      },
    }),
  }),
}));

vi.mock("@/lib/db/postgres-errors", () => ({
  isUndefinedColumnError: (err: unknown) => state.isUndefinedColumnError(err),
  isUndefinedTableError: (err: unknown) => state.isUndefinedTableError(err),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  state.isUndefinedColumnError.mockReturnValue(false);
  state.isUndefinedTableError.mockReturnValue(false);
});

describe("sandbox-jobs DAL", () => {
  it("createSandboxJob returns a DTO and throws when returning is empty", async () => {
    const now = new Date(0);
    state.insertReturning.mockResolvedValueOnce([
      {
        createdAt: now,
        endedAt: null,
        exitCode: null,
        id: "job_1",
        jobType: "code_mode",
        metadata: { hello: "world" },
        projectId: "proj_1",
        runId: "run_1",
        startedAt: null,
        status: "pending",
        stepId: null,
        transcriptBlobRef: null,
        updatedAt: now,
      },
    ]);

    const { createSandboxJob } = await import("@/lib/data/sandbox-jobs.server");
    const dto = await createSandboxJob({
      jobType: "code_mode",
      projectId: "proj_1",
      runId: "run_1",
      status: "pending",
    });

    expect(dto).toEqual(
      expect.objectContaining({
        id: "job_1",
        jobType: "code_mode",
        projectId: "proj_1",
        runId: "run_1",
        status: "pending",
      }),
    );

    state.insertReturning.mockResolvedValueOnce([]);
    await expect(
      createSandboxJob({
        jobType: "code_mode",
        projectId: "proj_1",
        runId: "run_1",
        status: "pending",
      }),
    ).rejects.toMatchObject({
      code: "db_insert_failed",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("wraps undefined table/column errors into db_not_migrated", async () => {
    state.isUndefinedTableError.mockReturnValueOnce(true);
    state.insertReturning.mockRejectedValueOnce(new Error("missing table"));

    const { createSandboxJob } = await import("@/lib/data/sandbox-jobs.server");
    await expect(
      createSandboxJob({
        jobType: "code_mode",
        projectId: "proj_1",
        runId: "run_1",
        status: "pending",
      }),
    ).rejects.toMatchObject({
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("getSandboxJobById returns null when missing and maps DTO when present", async () => {
    state.findFirst.mockResolvedValueOnce(null);

    const { getSandboxJobById } = await import(
      "@/lib/data/sandbox-jobs.server"
    );
    await expect(getSandboxJobById("job_missing")).resolves.toBeNull();

    const now = new Date(0);
    state.findFirst.mockResolvedValueOnce({
      createdAt: now,
      endedAt: null,
      exitCode: null,
      id: "job_2",
      jobType: "index_repo",
      metadata: {},
      projectId: "proj_1",
      runId: "run_1",
      startedAt: now,
      status: "running",
      stepId: "step_1",
      transcriptBlobRef: null,
      updatedAt: now,
    });
    await expect(getSandboxJobById("job_2")).resolves.toMatchObject({
      id: "job_2",
      startedAt: now.toISOString(),
    });
  });

  it("listSandboxJobsByRun maps DTOs ordered by creation time", async () => {
    const now = new Date(0);
    state.findMany.mockResolvedValueOnce([
      {
        createdAt: now,
        endedAt: null,
        exitCode: null,
        id: "job_1",
        jobType: "code_mode",
        metadata: {},
        projectId: "proj_1",
        runId: "run_1",
        startedAt: null,
        status: "pending",
        stepId: null,
        transcriptBlobRef: null,
        updatedAt: now,
      },
    ]);

    const { listSandboxJobsByRun } = await import(
      "@/lib/data/sandbox-jobs.server"
    );
    await expect(listSandboxJobsByRun("run_1")).resolves.toEqual([
      expect.objectContaining({ createdAt: now.toISOString(), id: "job_1" }),
    ]);
  });

  it("updateSandboxJob merges metadata and throws not_found when missing", async () => {
    const now = new Date(0);
    state.findFirst
      .mockResolvedValueOnce({ metadata: { a: 1 } })
      .mockResolvedValueOnce(null);
    state.updateReturning.mockResolvedValueOnce([
      {
        createdAt: now,
        endedAt: null,
        exitCode: 0,
        id: "job_1",
        jobType: "code_mode",
        metadata: { a: 1, b: 2 },
        projectId: "proj_1",
        runId: "run_1",
        startedAt: now,
        status: "succeeded",
        stepId: null,
        transcriptBlobRef:
          "projects/proj_1/runs/run_1/sandbox/job_1.log-abc123",
        updatedAt: now,
      },
    ]);

    const { updateSandboxJob } = await import("@/lib/data/sandbox-jobs.server");
    const dto = await updateSandboxJob("job_1", {
      exitCode: 0,
      metadata: { b: 2 },
      status: "succeeded",
      transcriptBlobRef: "projects/proj_1/runs/run_1/sandbox/job_1.log-abc123",
    });

    expect(dto.metadata).toEqual({ a: 1, b: 2 });
    expect(state.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { a: 1, b: 2 } }),
    );

    await expect(updateSandboxJob("job_missing", {})).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<AppError>);
  });
});
