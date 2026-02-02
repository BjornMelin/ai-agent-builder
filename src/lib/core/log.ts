import "server-only";

import { nowIso } from "@/lib/core/time";

/**
 * Additional structured data attached to a log entry.
 */
export type LogFields = Readonly<Record<string, unknown>>;

/**
 * Safe, structured logger for server-only code.
 *
 * - Emits newline-delimited JSON.
 * - Redacts common secret-like keys.
 * - Normalizes `Error` objects.
 */
/* eslint-disable no-unused-vars -- type-only parameter names */
export type Logger = Readonly<{
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
  child: (fields: LogFields) => Logger;
}>;
/* eslint-enable no-unused-vars */

const REDACT_KEY = /password|secret|token|key|cookie|authorization/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeError(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
    };
  }
  return value;
}

function sanitize(value: unknown, depth: number, maxDepth: number): unknown {
  if (depth > maxDepth) {
    return "[Truncated]";
  }

  if (value instanceof Error) {
    return safeError(value);
  }

  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, depth + 1, maxDepth));
  }

  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (REDACT_KEY.test(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = sanitize(v, depth + 1, maxDepth);
    }
    return out;
  }

  if (typeof value === "string" && value.length > 300) {
    return `${value.slice(0, 297)}...`;
  }

  return value;
}

function sanitizeFields(
  fields: LogFields | undefined,
): Record<string, unknown> {
  if (!fields) {
    return {};
  }

  const sanitized = sanitize(fields, 0, 6);
  return isRecord(sanitized) ? sanitized : { fields: sanitized };
}

function write(
  level: "debug" | "info" | "warn" | "error",
  base: LogFields,
  message: string,
  fields: LogFields | undefined,
): void {
  const entry = {
    level,
    msg: message,
    ts: nowIso(),
    ...sanitizeFields(base),
    ...sanitizeFields(fields),
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  if (level === "debug") {
    console.debug(line);
    return;
  }
  console.info(line);
}

function createLogger(base: LogFields): Logger {
  return {
    child: (fields) => createLogger({ ...base, ...fields }),
    debug: (message, fields) => write("debug", base, message, fields),
    error: (message, fields) => write("error", base, message, fields),
    info: (message, fields) => write("info", base, message, fields),
    warn: (message, fields) => write("warn", base, message, fields),
  };
}

/**
 * Default logger instance.
 */
export const log: Logger = createLogger({});
