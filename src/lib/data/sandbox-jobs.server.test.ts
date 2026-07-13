import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
  selectRows: vi.fn(),
  updateReturning: vi.fn(),
  updateSet: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: () => {
    const db = {
      insert: () => ({
        values: (values: unknown) => {
          state.insertValues(values);
          return { returning: state.insertReturning };
        },
      }),
      query: {
        sandboxJobsTable: {
          findFirst: state.findFirst,
          findMany: state.findMany,
        },
      },
      select: () => ({
        from: () => ({
          where: () => ({
            for: state.selectRows,
            orderBy: state.selectRows,
          }),
        }),
      }),
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        await fn(db),
      update: () => ({
        set: (values: unknown) => {
          state.updateSet(values);
          return {
            where: () => ({ returning: state.updateReturning }),
          };
        },
      }),
    };
    return db;
  },
}));

function createRow(status = "pending") {
  const now = new Date(0);
  return {
    createdAt: now,
    endedAt: null,
    exitCode: null,
    id: "job_1",
    jobType: "code_mode",
    metadata: {},
    projectId: "proj_1",
    provisioningClaimedAt: null,
    provisioningExpiresAt: null,
    provisioningKey: null,
    runId: "run_1",
    sandboxId: null,
    sandboxStopClaimedAt: null,
    sandboxStoppedAt: null,
    startedAt: null,
    status,
    stepId: null,
    transcriptBlobRef: null,
    updatedAt: now,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  state.selectRows.mockResolvedValue([
    {
      cancelRequestedAt: null,
      databaseNow: new Date(0),
      status: "running",
    },
  ]);
});

describe("sandbox-jobs DAL", () => {
  it("creates a job only while its run accepts sandbox work", async () => {
    state.insertReturning.mockResolvedValueOnce([createRow()]);
    const { createSandboxJob } = await import("@/lib/data/sandbox-jobs.server");

    await expect(
      createSandboxJob({
        jobType: "code_mode",
        projectId: "proj_1",
        runId: "run_1",
        status: "pending",
      }),
    ).resolves.toMatchObject({
      id: "job_1",
      sandboxId: null,
      sandboxStoppedAt: null,
      status: "pending",
    });

    state.selectRows.mockResolvedValueOnce([
      { cancelRequestedAt: new Date(0), status: "running" },
    ]);
    await expect(
      createSandboxJob({
        jobType: "code_mode",
        projectId: "proj_1",
        runId: "run_1",
        status: "pending",
      }),
    ).rejects.toMatchObject({
      code: "sandbox_job_canceled",
      status: 409,
    } satisfies Partial<AppError>);
    expect(state.insertReturning).toHaveBeenCalledOnce();
  });

  it("throws when insert returning is empty", async () => {
    state.insertReturning.mockResolvedValueOnce([]);
    const { createSandboxJob } = await import("@/lib/data/sandbox-jobs.server");

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
    state.insertReturning.mockRejectedValueOnce(
      Object.assign(new Error("missing table"), { code: "42P01" }),
    );
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

  it("creates one stable provisioning job with a database-clock TTL window", async () => {
    const created = {
      ...createRow(),
      provisioningClaimedAt: new Date(0),
      provisioningExpiresAt: new Date(80_000),
      provisioningKey: "workflow-step-1",
    };
    state.findFirst.mockResolvedValueOnce(undefined);
    state.insertReturning.mockResolvedValueOnce([created]);
    const { claimSandboxJobProvisioning } = await import(
      "@/lib/data/sandbox-jobs.server"
    );

    await expect(
      claimSandboxJobProvisioning({
        createTimeoutMs: 20_000,
        jobType: "code_mode",
        projectId: "proj_1",
        provisioningKey: "workflow-step-1",
        runId: "run_1",
        timeoutMs: 60_000,
      }),
    ).resolves.toMatchObject({
      job: { id: "job_1", provisioningKey: "workflow-step-1" },
      state: "provision",
    });
    expect(state.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        provisioningClaimedAt: new Date(0),
        provisioningExpiresAt: new Date(80_000),
        provisioningKey: "workflow-step-1",
      }),
    );
  });

  it("waits for a live attempt then reclaims the same job after expiry", async () => {
    const existing = {
      ...createRow(),
      provisioningClaimedAt: new Date(0),
      provisioningExpiresAt: new Date(80_000),
      provisioningKey: "workflow-step-1",
    };
    const reclaimed = {
      ...existing,
      provisioningClaimedAt: new Date(100_000),
      provisioningExpiresAt: new Date(180_000),
      updatedAt: new Date(100_000),
    };
    state.findFirst.mockResolvedValueOnce(existing);
    const { claimSandboxJobProvisioning } = await import(
      "@/lib/data/sandbox-jobs.server"
    );
    const input = {
      createTimeoutMs: 20_000,
      jobType: "code_mode",
      projectId: "proj_1",
      provisioningKey: "workflow-step-1",
      runId: "run_1",
      timeoutMs: 60_000,
    };

    await expect(claimSandboxJobProvisioning(input)).resolves.toMatchObject({
      job: { id: "job_1" },
      state: "pending",
    });

    state.findFirst.mockResolvedValueOnce(existing);
    state.selectRows.mockResolvedValueOnce([
      {
        cancelRequestedAt: null,
        databaseNow: new Date(100_000),
        status: "running",
      },
    ]);
    state.updateReturning.mockResolvedValueOnce([reclaimed]);
    await expect(claimSandboxJobProvisioning(input)).resolves.toMatchObject({
      job: { id: "job_1" },
      state: "provision",
    });
    expect(state.insertReturning).not.toHaveBeenCalled();
    expect(state.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        provisioningClaimedAt: new Date(100_000),
        provisioningExpiresAt: new Date(180_000),
      }),
    );
  });

  it("publishes the sandbox ID without overwriting a cancellation claim", async () => {
    const canceling = { ...createRow("canceling"), sandboxId: null };
    const published = { ...canceling, sandboxId: "sandbox_1" };
    state.selectRows.mockResolvedValueOnce([canceling]);
    state.updateReturning.mockResolvedValueOnce([published]);
    const { activateSandboxJob } = await import(
      "@/lib/data/sandbox-jobs.server"
    );

    await expect(
      activateSandboxJob("job_1", {
        sandboxId: "sandbox_1",
        startedAt: new Date(0),
      }),
    ).resolves.toMatchObject({
      sandboxId: "sandbox_1",
      status: "canceling",
    });
    expect(state.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: "sandbox_1",
        status: "canceling",
      }),
    );
  });

  it("publishes ownership without mutating terminal status", async () => {
    const failed = createRow("failed");
    const published = { ...failed, sandboxId: "sandbox_1" };
    state.selectRows.mockResolvedValueOnce([failed]);
    state.updateReturning.mockResolvedValueOnce([published]);
    const { publishSandboxJobOwnership } = await import(
      "@/lib/data/sandbox-jobs.server"
    );

    await expect(
      publishSandboxJobOwnership("job_1", "sandbox_1"),
    ).resolves.toMatchObject({ sandboxId: "sandbox_1", status: "failed" });
    expect(state.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: "sandbox_1" }),
    );
    expect(state.updateSet.mock.calls[0]?.[0]).not.toHaveProperty("status");
  });

  it("gets and lists JSON-safe DTOs", async () => {
    const row = {
      ...createRow("running"),
      sandboxId: "sandbox_1",
      sandboxStoppedAt: new Date(1),
    };
    state.findFirst.mockResolvedValueOnce(row);
    state.findMany.mockResolvedValueOnce([row]);
    const { getSandboxJobById, listSandboxJobsByRun } = await import(
      "@/lib/data/sandbox-jobs.server"
    );

    await expect(getSandboxJobById("job_1")).resolves.toMatchObject({
      sandboxId: "sandbox_1",
      sandboxStoppedAt: new Date(1).toISOString(),
    });
    await expect(listSandboxJobsByRun("run_1")).resolves.toHaveLength(1);
  });

  it("claims active jobs and returns terminal resource owners too", async () => {
    const now = new Date(0);
    const rows = [
      { ...createRow("canceling"), sandboxId: "sandbox_1" },
      { ...createRow("succeeded"), id: "job_2", sandboxId: "sandbox_1" },
    ];
    state.selectRows
      .mockResolvedValueOnce([{ databaseNow: now }])
      .mockResolvedValueOnce(rows);
    const { claimSandboxJobsForCancellation } = await import(
      "@/lib/data/sandbox-jobs.server"
    );

    await expect(
      claimSandboxJobsForCancellation("run_1"),
    ).resolves.toHaveLength(2);
    expect(state.updateSet).toHaveBeenNthCalledWith(1, {
      status: "canceling",
      updatedAt: now,
    });
    expect(state.updateSet).toHaveBeenNthCalledWith(2, {
      endedAt: now,
      status: "canceled",
      updatedAt: now,
    });
    expect(state.updateSet).toHaveBeenNthCalledWith(3, {
      endedAt: now,
      status: "canceled",
      updatedAt: now,
    });
  });

  it("terminalizes cancellation claims whose sandbox was already confirmed stopped", async () => {
    const now = new Date(0);
    const rows = [
      {
        ...createRow("canceled"),
        endedAt: now,
        sandboxId: "sandbox_1",
        sandboxStoppedAt: now,
      },
    ];
    state.selectRows
      .mockResolvedValueOnce([{ databaseNow: now }])
      .mockResolvedValueOnce(rows);
    const { claimSandboxJobsForCancellation } = await import(
      "@/lib/data/sandbox-jobs.server"
    );

    await expect(
      claimSandboxJobsForCancellation("run_1"),
    ).resolves.toMatchObject([
      {
        sandboxId: "sandbox_1",
        sandboxStoppedAt: now.toISOString(),
        status: "canceled",
      },
    ]);
    expect(state.updateSet).toHaveBeenNthCalledWith(2, {
      endedAt: now,
      status: "canceled",
      updatedAt: now,
    });
  });

  it("persists per-sandbox stop confirmation before job completion", async () => {
    const now = new Date(0);
    const { confirmSandboxStoppedForRun } = await import(
      "@/lib/data/sandbox-jobs.server"
    );

    await confirmSandboxStoppedForRun("run_1", "sandbox_1", now);
    expect(state.updateSet).toHaveBeenNthCalledWith(1, {
      sandboxStopClaimedAt: null,
      sandboxStoppedAt: now,
      updatedAt: now,
    });
    expect(state.updateSet).toHaveBeenNthCalledWith(2, {
      endedAt: now,
      status: "canceled",
      updatedAt: now,
    });
  });

  it("serializes external sandbox stops with an expiring claim", async () => {
    const now = new Date(10_000);
    state.selectRows.mockResolvedValueOnce([
      {
        databaseNow: now,
        sandboxStopClaimedAt: null,
        sandboxStoppedAt: null,
      },
    ]);
    const { claimSandboxStopForRun } = await import(
      "@/lib/data/sandbox-jobs.server"
    );

    await expect(
      claimSandboxStopForRun("run_1", "sandbox_1", 30_000),
    ).resolves.toEqual({ claimedAt: now, state: "claimed" });
    expect(state.updateSet).toHaveBeenCalledWith({
      sandboxStopClaimedAt: now,
      updatedAt: now,
    });

    state.updateSet.mockClear();
    state.selectRows.mockResolvedValueOnce([
      {
        databaseNow: new Date(now.getTime() + 1),
        sandboxStopClaimedAt: now,
        sandboxStoppedAt: null,
      },
    ]);
    await expect(
      claimSandboxStopForRun("run_1", "sandbox_1", 30_000),
    ).resolves.toEqual({ state: "busy" });
    expect(state.updateSet).not.toHaveBeenCalled();
  });

  it("completes a claimed no-resource job", async () => {
    const now = new Date(0);
    const { completeSandboxJobCancellation } = await import(
      "@/lib/data/sandbox-jobs.server"
    );

    await completeSandboxJobCancellation(["job_1"], now);
    expect(state.updateSet).toHaveBeenCalledWith({
      endedAt: now,
      status: "canceled",
      updatedAt: now,
    });
  });

  it("merges metadata but never overwrites a cancellation claim", async () => {
    const existing = { ...createRow("running"), metadata: { a: 1 } };
    state.findFirst.mockResolvedValueOnce(existing);
    state.updateReturning.mockResolvedValueOnce([
      { ...existing, metadata: { a: 1, b: 2 }, status: "succeeded" },
    ]);
    const { updateSandboxJob } = await import("@/lib/data/sandbox-jobs.server");

    await expect(
      updateSandboxJob("job_1", { metadata: { b: 2 }, status: "succeeded" }),
    ).resolves.toMatchObject({ metadata: { a: 1, b: 2 } });

    state.findFirst.mockResolvedValueOnce(createRow("canceling"));
    await expect(
      updateSandboxJob("job_1", { status: "running" }),
    ).resolves.toMatchObject({ status: "canceling" });
  });
});
