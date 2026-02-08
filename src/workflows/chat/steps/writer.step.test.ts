import { describe, expect, it, vi } from "vitest";

import {
  writeStreamClose,
  writeUserMessageMarker,
} from "@/workflows/chat/steps/writer.step";

describe("chat writer steps", () => {
  it("writes a user message marker chunk with a stable timestamp", async () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    try {
      const written: unknown[] = [];
      const writable = new WritableStream({
        write(chunk) {
          written.push(chunk);
        },
      });

      await writeUserMessageMarker(writable, {
        content: "hi",
        messageId: "m1",
      });

      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({
        data: {
          content: "hi",
          id: "m1",
          timestamp: 123,
          type: "user-message",
        },
        type: "data-workflow",
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("writes a finish chunk and closes the stream", async () => {
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

    await writeStreamClose(writable);

    expect(written).toEqual([{ type: "finish" }]);
    expect(closed).toBe(true);
  });
});
