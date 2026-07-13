import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  defineHook: vi.fn(),
}));

vi.mock("workflow", () => ({
  defineHook: (input: unknown) => state.defineHook(input),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("chatMessageHook", () => {
  it("requires a waiting generation, client message id, and message or files", async () => {
    state.defineHook.mockImplementation((input: unknown) => input);

    await import("@/workflows/chat/hooks/chat-message");

    expect(state.defineHook).toHaveBeenCalledTimes(1);
    const arg = state.defineHook.mock.calls[0]?.[0] as { schema?: unknown };
    expect(arg && typeof arg === "object").toBe(true);
    expect(arg.schema).toBeTruthy();

    // Schema is a Zod object at runtime; validate basic behavior.
    const schema = arg.schema as {
      safeParse: (value: unknown) => { success: boolean };
    };
    expect(
      schema.safeParse({
        message: "hi",
        messageId: "m1",
        schemaVersion: 2,
        waitingSince: "2026-07-13T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        files: [
          {
            mediaType: "application/pdf",
            type: "file",
            url: "https://example.com/file.pdf",
          },
        ],
        messageId: "m1",
        schemaVersion: 2,
        waitingSince: "2026-07-13T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        message: "",
        messageId: "m1",
        schemaVersion: 2,
        waitingSince: "2026-07-13T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        messageId: "m1",
        schemaVersion: 2,
        waitingSince: "2026-07-13T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        message: "hi",
        messageId: "m1",
        waitingSince: "2026-07-13T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        message: "hi",
        messageId: "assistant:run_1:2",
        schemaVersion: 2,
        waitingSince: "2026-07-13T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
