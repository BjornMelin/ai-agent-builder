import { describe, expect, it } from "vitest";

import {
  closeRunStream,
  writeRunEvent,
} from "@/workflows/runs/steps/writer.step";

describe("run writer steps", () => {
  it("writes structured run events as data-workflow chunks", async () => {
    const written: unknown[] = [];
    const writable = new WritableStream({
      write(chunk) {
        written.push(chunk);
      },
    });

    await writeRunEvent(writable, {
      runId: "run_1",
      status: "running",
      timestamp: 0,
      type: "run-finished",
    });

    expect(written).toEqual([
      {
        data: {
          runId: "run_1",
          status: "running",
          timestamp: 0,
          type: "run-finished",
        },
        type: "data-workflow",
      },
    ]);
  });

  it("closes the run stream with a finish chunk", async () => {
    const written: unknown[] = [];
    let closed = false;
    const writable = new WritableStream({
      close() {
        closed = true;
      },
      write(chunk) {
        written.push(chunk);
      },
    });

    await closeRunStream(writable);

    expect(written).toEqual([{ type: "finish" }]);
    expect(closed).toBe(true);
  });
});
