import { describe, expect, it } from "vitest";

import { getRequestOrigin } from "@/lib/next/request-origin";

describe("getRequestOrigin", () => {
  it("prefers the Origin header when present", () => {
    const headers = new Headers({ origin: "https://origin.example.com" });
    expect(getRequestOrigin(headers)).toBe("https://origin.example.com");
  });

  it("uses forwarded headers when origin is absent", () => {
    const headers = new Headers({
      "x-forwarded-host": "example.com",
      "x-forwarded-proto": "https",
    });
    expect(getRequestOrigin(headers)).toBe("https://example.com");
  });

  it("defaults to https when forwarded proto is missing", () => {
    const headers = new Headers({
      "x-forwarded-host": "example.com",
    });
    expect(getRequestOrigin(headers)).toBe("https://example.com");
  });

  it("falls back to host header when forwarded host is missing", () => {
    const headers = new Headers({
      host: "example.com",
      "x-forwarded-proto": "http",
    });
    expect(getRequestOrigin(headers)).toBe("http://example.com");
  });

  it("returns empty string when no host information is available", () => {
    expect(getRequestOrigin(new Headers())).toBe("");
  });
});
