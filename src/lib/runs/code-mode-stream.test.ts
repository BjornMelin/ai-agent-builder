import { describe, expect, it } from "vitest";

import { codeModeStreamEventSchema } from "@/lib/runs/code-mode-stream";

describe("codeModeStreamEventSchema", () => {
  it("accepts all known event shapes", () => {
    const events = [
      { message: "ok", timestamp: 0, type: "status" },
      { data: "out", stream: "stdout", timestamp: 1, type: "log" },
      { data: "err", stream: "stderr", timestamp: 2, type: "log" },
      { textDelta: "hi", timestamp: 3, type: "assistant-delta" },
      { timestamp: 4, toolName: "sandbox_run", type: "tool-call" },
      {
        output: { ok: true },
        timestamp: 5,
        toolName: "sandbox_run",
        type: "tool-result",
      },
      { exitCode: 0, timestamp: 6, type: "exit" },
    ] as const;

    for (const event of events) {
      expect(codeModeStreamEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("rejects invalid event shapes", () => {
    expect(
      codeModeStreamEventSchema.safeParse({ type: "status" }).success,
    ).toBe(false);
    expect(
      codeModeStreamEventSchema.safeParse({
        data: "x",
        stream: "nope",
        timestamp: 0,
        type: "log",
      }).success,
    ).toBe(false);
  });
});
