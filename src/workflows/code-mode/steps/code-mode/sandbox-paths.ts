import "server-only";

import { AppError } from "@/lib/core/errors";

/** Absolute root for all Code Mode sandbox filesystem operations. */
export const SANDBOX_WORKSPACE_ROOT = "/vercel/sandbox";

const PATH_TRAVERSAL_SEGMENT_RE = /(^|\/)\.\.(\/|$)/;

const isWithinSandboxWorkspace = (value: string): boolean =>
  value === SANDBOX_WORKSPACE_ROOT ||
  value.startsWith(`${SANDBOX_WORKSPACE_ROOT}/`);

/**
 * Resolve a sandbox `cwd` that is constrained to `/vercel/sandbox`.
 *
 * @param raw - User-provided cwd.
 * @returns Resolved absolute cwd or undefined when input is blank.
 * @throws AppError - When cwd attempts to escape the workspace.
 */
export function resolveSandboxCwd(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Default to /vercel/sandbox for relative paths.
  if (!trimmed.startsWith("/")) {
    if (PATH_TRAVERSAL_SEGMENT_RE.test(trimmed)) {
      throw new AppError("bad_request", 400, "Invalid cwd.");
    }
    return `${SANDBOX_WORKSPACE_ROOT}/${trimmed}`.replaceAll("//", "/");
  }

  if (!isWithinSandboxWorkspace(trimmed)) {
    throw new AppError(
      "bad_request",
      400,
      `cwd must be within ${SANDBOX_WORKSPACE_ROOT}.`,
    );
  }
  if (PATH_TRAVERSAL_SEGMENT_RE.test(trimmed)) {
    throw new AppError("bad_request", 400, "Invalid cwd.");
  }

  return trimmed;
}

/**
 * Resolve a sandbox file path that is constrained to `/vercel/sandbox`.
 *
 * @param raw - User-provided path.
 * @returns Resolved absolute path.
 * @throws AppError - When the path attempts to escape the workspace.
 */
export function resolveSandboxPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new AppError("bad_request", 400, "Invalid sandbox path.");
  }
  if (trimmed.startsWith("~")) {
    throw new AppError("bad_request", 400, "Invalid sandbox path.");
  }

  if (trimmed.startsWith("/")) {
    if (!isWithinSandboxWorkspace(trimmed)) {
      throw new AppError(
        "bad_request",
        400,
        `Path must be within ${SANDBOX_WORKSPACE_ROOT}.`,
      );
    }
    if (PATH_TRAVERSAL_SEGMENT_RE.test(trimmed)) {
      throw new AppError("bad_request", 400, "Invalid sandbox path.");
    }
    return trimmed;
  }

  if (PATH_TRAVERSAL_SEGMENT_RE.test(trimmed)) {
    throw new AppError("bad_request", 400, "Invalid sandbox path.");
  }

  return `${SANDBOX_WORKSPACE_ROOT}/${trimmed}`.replaceAll("//", "/");
}
