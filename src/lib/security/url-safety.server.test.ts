import { describe, expect, it } from "vitest";

import type { AppError } from "@/lib/core/errors";
import { assertSafeExternalHttpUrl } from "@/lib/security/url-safety.server";

function expectBadRequest(rawUrl: string) {
  try {
    assertSafeExternalHttpUrl(rawUrl);
    throw new Error("Expected assertSafeExternalHttpUrl() to throw.");
  } catch (err) {
    expect(err).toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  }
}

describe("assertSafeExternalHttpUrl", () => {
  it("accepts http(s) URLs with default ports", () => {
    expect(
      assertSafeExternalHttpUrl("http://example.com/path").toString(),
    ).toBe("http://example.com/path");
    expect(assertSafeExternalHttpUrl("https://example.com").toString()).toBe(
      "https://example.com/",
    );
    expect(
      assertSafeExternalHttpUrl("https://example.com:443/a").toString(),
    ).toBe("https://example.com/a");
    expect(
      assertSafeExternalHttpUrl("http://example.com:80/a").toString(),
    ).toBe("http://example.com/a");
  });

  it("rejects empty, invalid, and control-character URLs", () => {
    expectBadRequest(" ");
    expectBadRequest("not-a-url");
    expectBadRequest("https://example.com/\u0000bad");
  });

  it("rejects overly long URLs", () => {
    expectBadRequest(`https://example.com/${"a".repeat(10_000)}`);
  });

  it("rejects non-http(s) protocols", () => {
    expectBadRequest("ftp://example.com");
    expectBadRequest("file:///etc/passwd");
  });

  it("rejects URLs that include credentials", () => {
    expectBadRequest("https://user:pass@example.com/");
  });

  it("rejects non-default ports", () => {
    expectBadRequest("https://example.com:8080/path");
    expectBadRequest("http://example.com:123/path");
  });

  it("rejects localhost and internal hostnames", () => {
    expectBadRequest("http://localhost");
    expectBadRequest("https://localhost./");
    expectBadRequest("http://service.internal/path");
    expectBadRequest("https://example.local/path");
    expectBadRequest("https://example.lan/path");
    expectBadRequest("http://0/path");
  });

  it("rejects IPv4 and IPv6 literals", () => {
    expectBadRequest("https://127.0.0.1");
    expectBadRequest("http://[::1]");
    expectBadRequest("http://[2001:db8::1]/");
  });

  it("rejects integer/hex/octal host representations used for SSRF bypasses", () => {
    expectBadRequest("http://2130706433/");
    expectBadRequest("http://0x7f000001/");
    expectBadRequest("http://017700000001/");
  });
});
