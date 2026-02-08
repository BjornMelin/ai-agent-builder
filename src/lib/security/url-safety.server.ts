import "server-only";

import { isIP } from "node:net";

import { AppError } from "@/lib/core/errors";

const MAX_URL_LENGTH = 2048;

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.", "0"]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".lan",
] as const;

function assertValidHost(hostname: string): void {
  const host = hostname.trim().toLowerCase();

  if (host.length === 0) {
    throw new AppError("bad_request", 400, "Invalid URL host.");
  }

  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new AppError("bad_request", 400, "URL host is not allowed.");
  }

  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (host.endsWith(suffix)) {
      throw new AppError("bad_request", 400, "URL host is not allowed.");
    }
  }

  // Reject IPv4/IPv6 literals (we do not do DNS resolution here).
  const ipCandidate =
    host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (isIP(ipCandidate) !== 0) {
    throw new AppError("bad_request", 400, "IP literal URLs are not allowed.");
  }

  // Reject integer/hex/octal host representations often used for SSRF bypasses.
  if (
    /^\d+$/.test(host) ||
    /^0x[0-9a-f]+$/i.test(host) ||
    /^0[0-7]+$/.test(host)
  ) {
    throw new AppError("bad_request", 400, "URL host is not allowed.");
  }
}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Parse and validate an external URL for safe, outbound HTTP(S) fetching.
 *
 * @remarks
 * This is a defense-in-depth guardrail against SSRF. It is intentionally
 * deterministic and does not perform DNS resolution.
 *
 * @param rawUrl - Untrusted URL string.
 * @returns Parsed, normalized URL.
 * @throws AppError - With code "bad_request" when the URL is unsafe.
 */
export function assertSafeExternalHttpUrl(rawUrl: string): URL {
  const value = rawUrl.trim();

  if (value.length === 0) {
    throw new AppError("bad_request", 400, "Invalid URL.");
  }

  if (value.length > MAX_URL_LENGTH) {
    throw new AppError("bad_request", 400, "URL is too long.");
  }

  if (hasControlChars(value)) {
    throw new AppError("bad_request", 400, "Invalid URL.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("bad_request", 400, "Invalid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("bad_request", 400, "Unsupported URL protocol.");
  }

  // Disallow userinfo in URLs.
  if (url.username.length > 0 || url.password.length > 0) {
    throw new AppError("bad_request", 400, "URL must not include credentials.");
  }

  // Restrict ports to the default HTTP(S) ports.
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new AppError("bad_request", 400, "Unsupported URL port.");
  }

  assertValidHost(url.hostname);

  return url;
}
