/**
 * Create a stable, globally unique identifier.
 *
 * Uses `crypto.randomUUID()` (no additional dependencies).
 *
 * @returns A new UUID string.
 */
export function newId(): string {
  return crypto.randomUUID();
}
