import "server-only";

import { redactSandboxLog } from "@/lib/sandbox/redaction.server";

/**
 * Truncate text to a bounded size for safe UI streaming.
 *
 * @param value - Raw text.
 * @param maxChars - Hard cap.
 * @returns Possibly truncated text with a suffix marker.
 */
export function limitText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[output truncated]`;
}

/**
 * Redact tool-call args for safe stream persistence.
 *
 * @param args - Raw args.
 * @returns Redacted args list.
 */
export function redactToolCallArgs(
  args: readonly string[] | undefined,
): string[] {
  if (!args) return [];
  return args.map((arg) => redactSandboxLog(arg));
}

/**
 * Redact an arbitrary tool payload while attempting to preserve object shape.
 *
 * @param value - Tool payload.
 * @returns Redacted payload.
 */
export function redactStreamPayload(value: unknown): unknown {
  if (value === undefined) return undefined;

  if (typeof value === "string") {
    return redactSandboxLog(value);
  }

  try {
    const redacted = redactSandboxLog(JSON.stringify(value));
    // Preserve object shape for UI rendering when possible.
    return JSON.parse(redacted) as unknown;
  } catch {
    try {
      return redactSandboxLog(String(value));
    } catch {
      return "<redacted>";
    }
  }
}
