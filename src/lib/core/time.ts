/**
 * Current unix timestamp (milliseconds).
 *
 * @returns Unix ms timestamp.
 */
export function unixMs(): number {
  return Date.now();
}

/**
 * Current unix timestamp (seconds).
 *
 * @returns Unix seconds timestamp.
 */
export function unixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Current time as an ISO 8601 string (`toISOString()`).
 *
 * @returns ISO timestamp string.
 */
export function nowIso(): string {
  return new Date().toISOString();
}
