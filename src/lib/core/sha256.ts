import "server-only";

import { createHash } from "node:crypto";

/**
 * Compute a sha256 hex digest for input data.
 *
 * @param data - Input data.
 * @returns Lowercase hex digest.
 */
export function sha256Hex(data: Uint8Array | string): string {
  const hash = createHash("sha256");
  hash.update(data);
  return hash.digest("hex");
}
