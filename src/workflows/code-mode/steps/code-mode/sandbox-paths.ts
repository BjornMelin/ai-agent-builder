import "server-only";

import { AppError } from "@/lib/core/errors";

export const SANDBOX_WORKSPACE_ROOT = "/vercel/sandbox";

const PATH_TRAVERSAL_SEGMENT_RE = /(^|\/)\.\.(\/|$)/;

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

  if (!trimmed.startsWith(SANDBOX_WORKSPACE_ROOT)) {
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
    if (!trimmed.startsWith(SANDBOX_WORKSPACE_ROOT)) {
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

/**
 * Rewrite allowlisted command args so ctx-zip tools stay within the sandbox workspace.
 *
 * @remarks
 * ctx-zip tools tend to accept a final path argument that can be relative.
 * This forces those args into `/vercel/sandbox` to avoid escaping.
 *
 * @param cmd - Command name.
 * @param args - Original args.
 * @returns Rewritten args.
 */
export function rewriteSandboxArgsForWorkspace(
  cmd: string,
  args: readonly string[],
): readonly string[] {
  if (args.length === 0) return args;

  const next = [...args];

  const rewriteAt = (index: number) => {
    const current = next[index];
    if (typeof current !== "string") return;
    next[index] = resolveSandboxPath(current);
  };

  switch (cmd) {
    case "ls": {
      // ctx-zip places the path as the final arg.
      rewriteAt(next.length - 1);
      break;
    }
    case "cat": {
      rewriteAt(0);
      break;
    }
    case "grep": {
      // Args end with: <pattern> <path>
      rewriteAt(next.length - 1);
      break;
    }
    case "find": {
      rewriteAt(0);
      break;
    }
    case "mkdir": {
      // Best-effort: the final arg is the path.
      rewriteAt(next.length - 1);
      break;
    }
    case "test": {
      // For `test -f <path>` or similar, rewrite the final arg.
      rewriteAt(next.length - 1);
      break;
    }
    default: {
      break;
    }
  }

  return next;
}
