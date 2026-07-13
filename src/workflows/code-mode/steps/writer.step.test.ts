import { createWritableCollector } from "@tests/utils/streams";
import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import { closeCodeModeStream, writeCodeModeEvent } from "./writer.step";

describe("code mode writer steps", () => {
  it("writeCodeModeEvent emits a data-workflow chunk", async () => {
    const { writable, writes } = createWritableCollector<UIMessageChunk>();

    await writeCodeModeEvent(writable, {
      message: "hi",
      timestamp: 0,
      type: "status",
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({
      data: {
        domain: "code-mode",
        message: "hi",
        timestamp: 0,
        type: "status",
        version: 2,
      },
      type: "data-workflow",
    });
  });

  it("writes the canonical structured terminal event", async () => {
    const { writable, writes } = createWritableCollector<UIMessageChunk>();

    await writeCodeModeEvent(writable, {
      status: "failed",
      timestamp: 1,
      type: "terminal",
    });

    expect(writes).toEqual([
      {
        data: {
          domain: "code-mode",
          status: "failed",
          timestamp: 1,
          type: "terminal",
          version: 2,
        },
        type: "data-workflow",
      },
    ]);
  });

  it("closeCodeModeStream writes finish then closes", async () => {
    const { writable, writes } = createWritableCollector<UIMessageChunk>();

    await closeCodeModeStream(writable);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({ type: "finish" });
  });
});
