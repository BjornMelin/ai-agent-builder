import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as unknown,
}));

vi.mock("@/db/client", () => ({ getDb: () => state.db }));

const input = {
  networkAccess: "none" as const,
  projectId: "project_1",
  prompt: "hello",
  runId: "00000000-0000-4000-8000-000000000001",
  userId: "user_1",
};

function createEnsureDb(
  options?: Readonly<{
    activeId?: string;
    existing?: Readonly<{
      id: string;
      kind: "implementation" | "research";
      metadata: Record<string, unknown>;
      projectId: string;
    }>;
  }>,
) {
  const lock = vi.fn().mockResolvedValue([{ id: input.projectId }]);
  const activeLimit = vi
    .fn()
    .mockResolvedValue(options?.activeId ? [{ id: options.activeId }] : []);
  let selectCount = 0;
  const select = vi.fn(() => {
    selectCount += 1;
    if (selectCount === 1) {
      return {
        from: () => ({ where: () => ({ for: lock }) }),
      };
    }
    return {
      from: () => ({ where: () => ({ limit: activeLimit }) }),
    };
  });
  const values = vi.fn().mockResolvedValue(undefined);
  const tx = {
    insert: vi.fn(() => ({ values })),
    query: {
      runsTable: {
        findFirst: vi.fn().mockResolvedValue(options?.existing ?? null),
      },
    },
    select,
  };
  const db = {
    transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<void>) =>
        await callback(tx),
    ),
  };
  return { db, lock, tx, values };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("ensureCodeModeRun", () => {
  it("locks the project and inserts the client-known canonical run", async () => {
    const fake = createEnsureDb();
    state.db = fake.db;
    const { ensureCodeModeRun } = await import("./code-mode-start.server");

    await expect(ensureCodeModeRun(input)).resolves.toBeUndefined();

    expect(fake.lock).toHaveBeenCalledWith("update");
    expect(fake.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: input.runId,
        metadata: expect.objectContaining({
          origin: "code-mode",
          startedByUserId: "user_1",
        }),
      }),
    );
  });

  it("rejects a different active run under the same project lock", async () => {
    const fake = createEnsureDb({ activeId: "another_run" });
    state.db = fake.db;
    const { ensureCodeModeRun } = await import("./code-mode-start.server");

    await expect(ensureCodeModeRun(input)).rejects.toMatchObject({
      code: "conflict",
    });
    expect(fake.values).not.toHaveBeenCalled();
  });

  it("validates the complete request before reusing a run ID", async () => {
    const fake = createEnsureDb({
      existing: {
        id: input.runId,
        kind: "research",
        metadata: {
          networkAccess: "none",
          origin: "code-mode",
          prompt: "different",
          startedByUserId: "user_1",
        },
        projectId: input.projectId,
      },
    });
    state.db = fake.db;
    const { ensureCodeModeRun } = await import("./code-mode-start.server");

    await expect(ensureCodeModeRun(input)).rejects.toMatchObject({
      code: "conflict",
    });
    expect(fake.values).not.toHaveBeenCalled();
  });
});

describe("claimCodeModeWorkflow", () => {
  it("returns true only for the atomic database winner", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: input.runId }]);
    state.db = {
      query: { runsTable: { findFirst: vi.fn() } },
      update: () => ({
        set: () => ({ where: () => ({ returning }) }),
      }),
    };
    const { claimCodeModeWorkflow } = await import("./code-mode-start.server");

    await expect(claimCodeModeWorkflow(input.runId, "wf_winner")).resolves.toBe(
      true,
    );
  });

  it("lets the same winner retry but rejects a concurrent workflow", async () => {
    const existing = {
      cancelRequestedAt: null,
      metadata: { origin: "code-mode" },
      status: "pending",
      workflowRunId: "wf_winner",
    };
    const findFirst = vi.fn().mockResolvedValue(existing);
    state.db = {
      query: { runsTable: { findFirst } },
      update: () => ({
        set: () => ({
          where: () => ({ returning: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    };
    const { claimCodeModeWorkflow } = await import("./code-mode-start.server");

    await expect(claimCodeModeWorkflow(input.runId, "wf_winner")).resolves.toBe(
      true,
    );
    await expect(claimCodeModeWorkflow(input.runId, "wf_loser")).resolves.toBe(
      false,
    );
  });
});

describe("getActiveCodeModeRunId", () => {
  it.each([
    [{ id: input.runId }, input.runId],
    [null, null],
  ])("returns the active run ID or null", async (row, expected) => {
    const findFirst = vi.fn().mockResolvedValue(row);
    state.db = { query: { runsTable: { findFirst } } };
    const { getActiveCodeModeRunId } = await import("./code-mode-start.server");

    await expect(
      getActiveCodeModeRunId(input.projectId, input.userId),
    ).resolves.toBe(expected);
    expect(findFirst).toHaveBeenCalledOnce();
  });
});
