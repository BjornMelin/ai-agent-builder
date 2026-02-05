import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/db/client";
import { AppError } from "@/lib/core/errors";

type FakeRunStepRow = Readonly<{ attempt: number; status: string }>;

const state = vi.hoisted(() => ({
  db: null as unknown as DbClient,
}));

vi.mock("@/db/client", () => ({
  getDb: () => state.db,
}));

import { beginRunStep, finishRunStep } from "./persist.step";

function createFakeDb(stepRow: FakeRunStepRow | null) {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  const findFirst = vi.fn().mockResolvedValue(stepRow);

  const db = {
    query: {
      runStepsTable: { findFirst },
    },
    update,
  };

  return { db, findFirst, set, update, where };
}

function assertIsDate(value: unknown): asserts value is Date {
  expect(value).toBeInstanceOf(Date);
}

describe("persist.step", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("beginRunStep", () => {
    it("throws not_found when step row does not exist", async () => {
      const { db } = createFakeDb(null);
      state.db = db as unknown as DbClient;

      await expect(
        beginRunStep({ runId: "run_1", stepId: "step_1" }),
      ).rejects.toBeInstanceOf(AppError);
    });

    it("does nothing when step is already running", async () => {
      const { db, update } = createFakeDb({ attempt: 1, status: "running" });
      state.db = db as unknown as DbClient;

      await beginRunStep({ runId: "run_1", stepId: "step_1" });

      expect(update).not.toHaveBeenCalled();
    });

    it("does nothing when step is already succeeded", async () => {
      const { db, update } = createFakeDb({ attempt: 1, status: "succeeded" });
      state.db = db as unknown as DbClient;

      await beginRunStep({ runId: "run_1", stepId: "step_1" });

      expect(update).not.toHaveBeenCalled();
    });

    it("does nothing when step is already canceled", async () => {
      const { db, update } = createFakeDb({ attempt: 1, status: "canceled" });
      state.db = db as unknown as DbClient;

      await beginRunStep({ runId: "run_1", stepId: "step_1" });

      expect(update).not.toHaveBeenCalled();
    });

    it("marks step running and increments attempt when step is restartable", async () => {
      const { db, set, update } = createFakeDb({
        attempt: 5,
        status: "failed",
      });
      state.db = db as unknown as DbClient;

      await beginRunStep({ runId: "run_1", stepId: "step_1" });

      expect(update).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledTimes(1);

      const setArg = set.mock.calls[0]?.[0] as unknown;
      expect(setArg).toMatchObject({
        attempt: 6,
        status: "running",
      });

      const payload = setArg as Record<string, unknown>;
      assertIsDate(payload.startedAt);
      assertIsDate(payload.updatedAt);
      expect(payload.startedAt.getTime()).toBe(0);
      expect(payload.updatedAt.getTime()).toBe(0);
    });
  });

  describe("finishRunStep", () => {
    it("throws not_found when step row does not exist", async () => {
      const { db } = createFakeDb(null);
      state.db = db as unknown as DbClient;

      await expect(
        finishRunStep({
          runId: "run_1",
          status: "succeeded",
          stepId: "step_1",
        }),
      ).rejects.toBeInstanceOf(AppError);
    });

    it("does nothing when step is canceled", async () => {
      const { db, update } = createFakeDb({ attempt: 1, status: "canceled" });
      state.db = db as unknown as DbClient;

      await finishRunStep({
        runId: "run_1",
        status: "succeeded",
        stepId: "step_1",
      });

      expect(update).not.toHaveBeenCalled();
    });

    it("does nothing when step is succeeded", async () => {
      const { db, update } = createFakeDb({ attempt: 1, status: "succeeded" });
      state.db = db as unknown as DbClient;

      await finishRunStep({
        error: { message: "nope" },
        runId: "run_1",
        status: "failed",
        stepId: "step_1",
      });

      expect(update).not.toHaveBeenCalled();
    });

    it("updates when step is running", async () => {
      const { db, set, update } = createFakeDb({
        attempt: 1,
        status: "running",
      });
      state.db = db as unknown as DbClient;

      await finishRunStep({
        outputs: { ok: true },
        runId: "run_1",
        status: "succeeded",
        stepId: "step_1",
      });

      expect(update).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledTimes(1);

      const setArg = set.mock.calls[0]?.[0] as unknown;
      expect(setArg).toMatchObject({
        error: null,
        outputs: { ok: true },
        status: "succeeded",
      });

      const payload = setArg as Record<string, unknown>;
      assertIsDate(payload.endedAt);
      assertIsDate(payload.updatedAt);
      expect(payload.endedAt.getTime()).toBe(0);
      expect(payload.updatedAt.getTime()).toBe(0);
    });
  });
});
