import { describe, expect, it, vi } from "vitest";

import {
  writeChatFollowUpDisposition,
  writeChatSessionStatus,
  writeChatTerminalAndClose,
  writeStreamClose,
  writeUserMessageMarker,
} from "@/workflows/chat/steps/writer.step";

describe("chat writer steps", () => {
  it("writes a durable rejected follow-up disposition", async () => {
    vi.spyOn(Date, "now").mockReturnValue(41);
    try {
      const written: unknown[] = [];
      const writable = new WritableStream({
        write(chunk) {
          written.push(chunk);
        },
      });

      await writeChatFollowUpDisposition(writable, {
        messageId: "m1",
        outcome: "rejected",
        reason: "stale_delivery",
      });

      expect(written).toEqual([
        {
          data: {
            domain: "chat",
            messageId: "m1",
            outcome: "rejected",
            reason: "stale_delivery",
            timestamp: 41,
            type: "follow-up-disposition",
            version: 2,
          },
          type: "data-workflow",
        },
      ]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("writes the exact durable waiting lifecycle marker", async () => {
    vi.spyOn(Date, "now").mockReturnValue(42);
    try {
      const written: unknown[] = [];
      const writable = new WritableStream({
        write(chunk) {
          written.push(chunk);
        },
      });

      await writeChatSessionStatus(writable, "waiting");

      expect(written).toEqual([
        {
          data: {
            domain: "chat",
            status: "waiting",
            timestamp: 42,
            type: "session-status",
            version: 2,
          },
          type: "data-workflow",
        },
      ]);
    } finally {
      vi.restoreAllMocks();
    }
  });

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
          domain: "chat",
          id: "m1",
          timestamp: 123,
          type: "user-message",
          version: 2,
        },
        type: "data-workflow",
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("includes file parts when provided", async () => {
    vi.spyOn(Date, "now").mockReturnValue(456);
    try {
      const written: unknown[] = [];
      const writable = new WritableStream({
        write(chunk) {
          written.push(chunk);
        },
      });

      await writeUserMessageMarker(writable, {
        content: "",
        files: [
          {
            mediaType: "application/pdf",
            type: "file",
            url: "https://example.com/file.pdf",
          },
        ],
        messageId: "m2",
      });

      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({
        data: {
          content: "",
          domain: "chat",
          files: [
            {
              mediaType: "application/pdf",
              type: "file",
              url: "https://example.com/file.pdf",
            },
          ],
          id: "m2",
          timestamp: 456,
          type: "user-message",
          version: 2,
        },
        type: "data-workflow",
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("omits files when an empty array is provided", async () => {
    vi.spyOn(Date, "now").mockReturnValue(789);
    try {
      const written: unknown[] = [];
      const writable = new WritableStream({
        write(chunk) {
          written.push(chunk);
        },
      });

      await writeUserMessageMarker(writable, {
        content: "hi",
        files: [],
        messageId: "m3",
      });

      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({
        data: {
          content: "hi",
          domain: "chat",
          id: "m3",
          timestamp: 789,
          type: "user-message",
          version: 2,
        },
        type: "data-workflow",
      });

      expect(
        written.some(
          (chunk) =>
            typeof chunk === "object" &&
            chunk !== null &&
            "data" in chunk &&
            typeof (chunk as { data?: unknown }).data === "object" &&
            (chunk as { data?: Record<string, unknown> }).data !== null &&
            "files" in
              ((chunk as { data?: Record<string, unknown> }).data ?? {}),
        ),
      ).toBe(false);
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

  it("writes a safe error before finishing a failed stream", async () => {
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

    await writeStreamClose(writable, "Chat session failed.");

    expect(written).toEqual([
      { errorText: "Chat session failed.", type: "error" },
      { type: "finish" },
    ]);
    expect(closed).toBe(true);
  });

  it("writes the authoritative terminal marker before error and stream finish", async () => {
    vi.spyOn(Date, "now").mockReturnValue(84);
    try {
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

      await writeChatTerminalAndClose(
        writable,
        "failed",
        "Chat session failed.",
      );

      expect(written).toEqual([
        {
          data: {
            domain: "chat",
            status: "failed",
            timestamp: 84,
            type: "terminal",
            version: 2,
          },
          type: "data-workflow",
        },
        { errorText: "Chat session failed.", type: "error" },
        { type: "finish" },
      ]);
      expect(closed).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
