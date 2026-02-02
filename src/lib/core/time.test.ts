import { afterEach, describe, expect, it, vi } from "vitest";

import { nowIso, unixMs, unixSeconds } from "@/lib/core/time";

describe("time", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns deterministic values with fake timers", () => {
    const fixed = new Date("2026-01-01T00:00:00.123Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixed);

    expect(unixMs()).toBe(fixed.getTime());
    expect(unixSeconds()).toBe(Math.floor(fixed.getTime() / 1000));
    expect(nowIso()).toBe("2026-01-01T00:00:00.123Z");
  });
});
