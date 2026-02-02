import { describe, expect, it, vi } from "vitest";

describe("log", () => {
  it("writes structured JSON and redacts secret-like keys", async () => {
    const fixed = new Date("2026-01-01T00:00:00.123Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixed);

    const { log } = await import("@/lib/core/log");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    log.info("hello", {
      nested: { password: "pw" },
      token: "super-secret",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [line] = spy.mock.calls[0] ?? [];
    expect(typeof line).toBe("string");

    const parsed = JSON.parse(String(line)) as Record<string, unknown>;
    expect(parsed.ts).toBe("2026-01-01T00:00:00.123Z");
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("hello");
    expect(parsed.token).toBe("[REDACTED]");
    expect(parsed.nested).toEqual({ password: "[REDACTED]" });

    spy.mockRestore();
    vi.useRealTimers();
  });

  it("logs errors via console.error and normalizes Error objects", async () => {
    const fixed = new Date("2026-01-01T00:00:00.123Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixed);

    const { log } = await import("@/lib/core/log");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    log.error("boom", { err: new Error("fail"), token: "x" });

    expect(spy).toHaveBeenCalledTimes(1);
    const [line] = spy.mock.calls[0] ?? [];
    const parsed = JSON.parse(String(line)) as Record<string, unknown>;

    expect(parsed.level).toBe("error");
    expect(parsed.msg).toBe("boom");
    expect(parsed.token).toBe("[REDACTED]");
    expect(parsed.err).toEqual({ message: "fail", name: "Error" });

    spy.mockRestore();
    vi.useRealTimers();
  });

  it("truncates very long strings", async () => {
    vi.resetModules();
    const { log } = await import("@/lib/core/log");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    const long = "x".repeat(400);
    log.info("long", { text: long });

    const [line] = spy.mock.calls[0] ?? [];
    const parsed = JSON.parse(String(line)) as Record<string, unknown>;
    expect(typeof parsed.text).toBe("string");
    expect(String(parsed.text)).toHaveLength(300);
    expect(String(parsed.text).endsWith("...")).toBe(true);

    spy.mockRestore();
  });
});
