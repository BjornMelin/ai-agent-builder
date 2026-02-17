import { describe, expect, it } from "vitest";

import { codeModeStreamEventSchema } from "@/workflows/_shared/workflow-stream-events";

describe("codeModeStreamEventSchema", () => {
  it("accepts all known event shapes", () => {
    const events = [
      {
        domain: "code-mode",
        message: "ok",
        timestamp: 0,
        type: "status",
        version: 2,
      },
      {
        data: "out",
        domain: "code-mode",
        stream: "stdout",
        timestamp: 1,
        type: "log",
        version: 2,
      },
      {
        data: "err",
        domain: "code-mode",
        stream: "stderr",
        timestamp: 2,
        type: "log",
        version: 2,
      },
      {
        domain: "code-mode",
        textDelta: "hi",
        timestamp: 3,
        type: "assistant-delta",
        version: 2,
      },
      {
        domain: "code-mode",
        timestamp: 4,
        toolName: "sandbox_run",
        type: "tool-call",
        version: 2,
      },
      {
        domain: "code-mode",
        output: { ok: true },
        timestamp: 5,
        toolName: "sandbox_run",
        type: "tool-result",
        version: 2,
      },
      {
        domain: "code-mode",
        exitCode: 0,
        timestamp: 6,
        type: "exit",
        version: 2,
      },
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
        domain: "code-mode",
        stream: "nope",
        timestamp: 0,
        type: "log",
        version: 2,
      }).success,
    ).toBe(false);
  });
});
