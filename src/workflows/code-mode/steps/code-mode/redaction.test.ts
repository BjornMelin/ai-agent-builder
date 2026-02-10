import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sandbox/redaction.server", () => ({
  redactSandboxLog: (value: string) => value.replaceAll("SECRET", "<redacted>"),
}));

import {
  limitText,
  redactStreamPayload,
  redactToolCallArgs,
} from "./redaction";

describe("code mode redaction", () => {
  it("limits text with a truncation marker", () => {
    const out = limitText("x".repeat(10), 5);
    expect(out).toContain("[output truncated]");
  });

  it("redacts tool-call args", () => {
    expect(redactToolCallArgs(["a", "SECRET"])).toEqual(["a", "<redacted>"]);
    expect(redactToolCallArgs(undefined)).toEqual([]);
  });

  it("redacts stream payloads and preserves object shape when possible", () => {
    expect(redactStreamPayload("SECRET")).toBe("<redacted>");
    expect(redactStreamPayload({ ok: true, token: "SECRET" })).toEqual({
      ok: true,
      token: "<redacted>",
    });
  });

  it("falls back to stringifying payloads that JSON cannot encode", () => {
    expect(redactStreamPayload(1n)).toBe("1");
  });
});
