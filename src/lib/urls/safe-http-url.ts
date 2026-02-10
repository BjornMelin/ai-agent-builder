/**
 * Checks whether a string is a safe external HTTP(S) URL.
 *
 * @param value - URL string to check.
 * @returns True if the URL parses and uses http/https; otherwise false.
 *
 * @remarks
 * This is a small shared runtime guard used by both server and client code.
 */
export function isSafeExternalHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalize and validate a safe external HTTP(S) URL.
 *
 * @param value - Unknown input value.
 * @returns Trimmed URL string if safe; otherwise null.
 */
export function normalizeSafeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return isSafeExternalHttpUrl(trimmed) ? trimmed : null;
}
