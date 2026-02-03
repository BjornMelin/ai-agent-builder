import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RunDto, RunStepDto } from "@/lib/data/runs.server";

type ReturningRow = Record<string, unknown>;
type ReturningValue = ReturningRow[];

type DbChain = {
  set: (_values: Record<string, unknown>) => DbChain;
  where: (_conditions: unknown) => DbChain;
  returning: (_projection?: unknown) => Promise<ReturningValue>;
};

const state = vi.hoisted(() => ({
  ensureRunStep: vi.fn(),
  env: {
    app: { baseUrl: "https://app.example.com" },
    runtime: { nodeEnv: "development" },
  },
  getRunById: vi.fn(),
  publishJSON: vi.fn(),
}));

const dbState = vi.hoisted(() => {
  const returningQueue: ReturningValue[] = [];
  const data: { findFirstValue: ReturningRow | null } = {
    findFirstValue: null,
  };

  const chain: DbChain = {
    returning: vi.fn(async () => returningQueue.shift() ?? []),
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
  };

  const query = {
    runStepsTable: {
      findFirst: vi.fn(async () => data.findFirstValue),
    },
  };

  const update = vi.fn(() => chain);

  return {
    chain,
    data,
    query,
    returningQueue,
    update,
  };
});

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

vi.mock("@/lib/upstash/qstash.server", () => ({
  getQstashClient: () => ({
    publishJSON: state.publishJSON,
  }),
}));

vi.mock("@/lib/data/runs.server", () => ({
  ensureRunStep: state.ensureRunStep,
  getRunById: state.getRunById,
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    query: dbState.query,
    update: dbState.update,
  }),
}));

const runId = "run_123";
const stepId = "run.start";
const now = new Date(0).toISOString();

const baseRun = {
  createdAt: now,
  id: runId,
  kind: "research",
  metadata: {},
  projectId: "proj_123",
  status: "pending",
  updatedAt: now,
} satisfies RunDto;

const baseStep = {
  attempt: 0,
  createdAt: now,
  endedAt: null,
  error: null,
  id: "step_1",
  inputs: {},
  outputs: {},
  runId,
  startedAt: null,
  status: "pending",
  stepId,
  stepKind: "tool",
  stepName: "Start run",
  updatedAt: now,
} satisfies RunStepDto;

async function loadRunEngine() {
  vi.resetModules();
  return await import("@/lib/runs/run-engine.server");
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.returningQueue.length = 0;
  dbState.data.findFirstValue = null;

  state.env.app.baseUrl = "https://app.example.com";
  state.env.runtime.nodeEnv = "development";

  state.publishJSON.mockResolvedValue({
    messageId: "msg",
    url: "https://qstash",
  });
  state.getRunById.mockResolvedValue(baseRun);
  state.ensureRunStep.mockResolvedValue(baseStep);
});

describe("enqueueRunStep", () => {
  it("publishes run steps with a label", async () => {
    const { enqueueRunStep } = await loadRunEngine();

    await enqueueRunStep({ origin: "", runId, stepId });

    expect(state.publishJSON).toHaveBeenCalledWith({
      body: { runId, stepId },
      label: "run-step",
      url: "https://app.example.com/api/jobs/run-step",
    });
  });

  it("rejects insecure callback origins in production", async () => {
    const { enqueueRunStep } = await loadRunEngine();

    state.env.runtime.nodeEnv = "production";
    state.env.app.baseUrl = "http://insecure.local";

    await expect(
      enqueueRunStep({ origin: "", runId, stepId }),
    ).rejects.toThrowError(/callback origin/i);
  });

  it("rejects mismatched callback origins", async () => {
    const { enqueueRunStep } = await loadRunEngine();

    await expect(
      enqueueRunStep({ origin: "https://evil.example.com", runId, stepId }),
    ).rejects.toThrowError(/origin does not match/i);
  });
});

describe("executeRunStep", () => {
  it("throws when the run is missing", async () => {
    const { executeRunStep } = await loadRunEngine();

    state.getRunById.mockResolvedValueOnce(null);

    await expect(
      executeRunStep({ origin: "", runId, stepId }),
    ).rejects.toThrowError(/Run not found/i);
  });

  it("returns early for canceled runs", async () => {
    const { executeRunStep } = await loadRunEngine();

    state.getRunById.mockResolvedValueOnce({
      ...baseRun,
      status: "canceled",
    });

    const result = await executeRunStep({ origin: "", runId, stepId });
    expect(result.status).toBe("canceled");
    expect(state.ensureRunStep).not.toHaveBeenCalled();
  });

  it("short-circuits when the step already succeeded", async () => {
    const { executeRunStep } = await loadRunEngine();

    state.ensureRunStep.mockResolvedValueOnce({
      ...baseStep,
      status: "succeeded",
    });

    const result = await executeRunStep({ origin: "", runId, stepId });
    expect(result.status).toBe("succeeded");
    expect(state.publishJSON).not.toHaveBeenCalled();
  });

  it("executes a pending step and enqueues the next step", async () => {
    const { executeRunStep } = await loadRunEngine();

    state.getRunById.mockResolvedValueOnce({
      ...baseRun,
      status: "pending",
    });
    state.ensureRunStep.mockResolvedValueOnce({
      ...baseStep,
      status: "pending",
    });
    dbState.returningQueue.push([{ status: "running" }]);

    const result = await executeRunStep({
      origin: "https://app.example.com",
      runId,
      stepId,
    });

    expect(result.status).toBe("succeeded");
    expect(result.nextStepId).toBe("run.complete");
    expect(state.publishJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { runId, stepId: "run.complete" },
        label: "run-step",
      }),
    );
  });

  it("throws when enqueueing the next step fails", async () => {
    const { executeRunStep } = await loadRunEngine();

    state.getRunById.mockResolvedValueOnce({
      ...baseRun,
      status: "pending",
    });
    state.ensureRunStep.mockResolvedValueOnce({
      ...baseStep,
      status: "pending",
    });
    dbState.returningQueue.push([{ status: "running" }]);
    state.publishJSON.mockRejectedValueOnce(new Error("queue down"));

    await expect(
      executeRunStep({ origin: "https://app.example.com", runId, stepId }),
    ).rejects.toThrowError(/queue down/i);
  });
});
