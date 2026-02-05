import { describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/db/client";
import { cancelRunAndStepsTx } from "@/lib/data/run-cancel-tx";

function createFakeTx(status: string | null) {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });

  const findFirst = vi
    .fn()
    .mockResolvedValue(status === null ? null : ({ status } as unknown));

  const tx = {
    query: {
      runsTable: { findFirst },
    },
    update,
  };

  return { findFirst, set, tx, update, where };
}

describe("cancelRunAndStepsTx", () => {
  it("throws not_found when the run does not exist", async () => {
    const { tx } = createFakeTx(null);

    await expect(
      cancelRunAndStepsTx(tx as unknown as DbClient, {
        now: new Date(0),
        runId: "run_1",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("does nothing when run is succeeded", async () => {
    const { tx, update } = createFakeTx("succeeded");

    await cancelRunAndStepsTx(tx as unknown as DbClient, {
      now: new Date(0),
      runId: "run_1",
    });

    expect(update).not.toHaveBeenCalled();
  });

  it("does nothing when run is failed", async () => {
    const { tx, update } = createFakeTx("failed");

    await cancelRunAndStepsTx(tx as unknown as DbClient, {
      now: new Date(0),
      runId: "run_1",
    });

    expect(update).not.toHaveBeenCalled();
  });

  it("updates run + steps when run is cancelable", async () => {
    const { tx, update, set, where } = createFakeTx("running");

    await cancelRunAndStepsTx(tx as unknown as DbClient, {
      now: new Date(0),
      runId: "run_1",
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledTimes(2);
    expect(where).toHaveBeenCalledTimes(2);
  });

  it("updates run + steps when run is pending", async () => {
    const { tx, update, set, where } = createFakeTx("pending");

    await cancelRunAndStepsTx(tx as unknown as DbClient, {
      now: new Date(0),
      runId: "run_1",
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledTimes(2);
    expect(where).toHaveBeenCalledTimes(2);
  });

  it("does nothing when run is canceled", async () => {
    const { tx, update, set, where } = createFakeTx("canceled");

    await cancelRunAndStepsTx(tx as unknown as DbClient, {
      now: new Date(0),
      runId: "run_1",
    });

    expect(update).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(where).not.toHaveBeenCalled();
  });
});
