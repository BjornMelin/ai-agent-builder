import { createWritableCollector } from "@tests/utils/streams";
import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import { closeCodeModeStream, writeCodeModeEvent } from "./writer.step";

describe("code mode writer steps", () => {
  it("writeCodeModeEvent emits a data-code-mode chunk", async () => {
    const { writable, writes } = createWritableCollector<UIMessageChunk>();

    await writeCodeModeEvent(writable, {
      message: "hi",
      timestamp: 0,
      type: "status",
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({
      data: { message: "hi", timestamp: 0, type: "status" },
      type: "data-code-mode",
    });
  });

  it("closeCodeModeStream writes finish then closes", async () => {
    const { writable, writes } = createWritableCollector<UIMessageChunk>();

    await closeCodeModeStream(writable);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({ type: "finish" });
  });
});
