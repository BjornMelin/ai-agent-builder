/**
 * Checks whether a string is an HTTP(S) URL.
 *
 * @remarks
 * This only validates that the input parses as a URL and uses the `http:` or
 * `https:` protocol. It does not attempt to classify hosts as "external" or
 * "safe" for server-side outbound requests.
 *
 * @param value - URL string to check.
 * @returns True if the URL parses and uses http/https; otherwise false.
 */
export function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalize and validate an HTTP(S) URL.
 *
 * @param value - Unknown input value.
 * @returns Canonical URL string (`URL#href`) if it parses and uses http/https; otherwise null.
 */
export function normalizeHttpOrHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}
