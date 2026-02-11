/**
 * Sanitize a user-provided filename for storage and display.
 *
 * @param name - Raw file name from the client.
 * @returns A safe filename (ASCII subset) capped to 128 characters.
 */
export function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "upload";
  return trimmed.replaceAll(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 128);
}
