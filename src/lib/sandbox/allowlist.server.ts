import "server-only";

import { AppError } from "@/lib/core/errors";

export type SandboxCommandPolicy = "code_mode" | "implementation_run";

const SANDBOX_WORKSPACE_ROOT = "/vercel/sandbox";

const CODE_MODE_ALLOWED_COMMANDS: ReadonlySet<string> = new Set<string>([
  "cat",
  "find",
  "grep",
  "jq",
  "ls",
  "mkdir",
  "node",
  "python3",
  "rg",
  "sed",
  "test",
  "which",
]);

const IMPLEMENTATION_RUN_ALLOWED_COMMANDS: ReadonlySet<string> =
  new Set<string>([
    "bun",
    "bunx",
    "cat",
    "chmod",
    "find",
    "git",
    "grep",
    "jq",
    "ls",
    "mkdir",
    "node",
    "npm",
    "npx",
    "pnpm",
    "python3",
    "rg",
    "sed",
    "test",
    "tsc",
    "uv",
    "which",
  ]);

const BLOCKED_SUBSTRINGS = [
  "rm -rf",
  "mkfs",
  "dd if=",
  ":(){",
  "nc ",
  "ncat ",
  "nmap",
  "scp ",
  "ssh ",
  "docker ",
  "podman ",
  "mount ",
  "apt ",
  "yum ",
] as const;

const EXEC_ALLOWED_PACKAGES: ReadonlySet<string> = new Set<string>([
  "@biomejs/biome",
  "@next/codemod",
  "agent-browser",
  "ai-elements",
  "biome",
  "cypress",
  "drizzle-kit",
  "eslint",
  "jest",
  "markdownlint-cli",
  "neon",
  "neonctl",
  "opensrc",
  "playwright",
  "pnpm",
  "prettier",
  "repomix",
  "shadcn",
  "skills",
  "supabase",
  "turbo",
  "tsx",
  "typescript",
  "vercel",
  "vitest",
  "workflow",
]);

const EXEC_ALLOWED_LEADING_FLAGS: ReadonlySet<string> = new Set<string>([
  "-y",
  "--yes",
  "--bun",
]);

const FIND_BLOCKED_FLAGS: ReadonlySet<string> = new Set<string>([
  "-delete",
  "-exec",
  "-execdir",
  "-ok",
  "-okdir",
]);

const MAX_ARGS = 64;
const MAX_ARG_LENGTH = 8_192;

function assertSafeArg(value: string): void {
  if (value.length > MAX_ARG_LENGTH) {
    throw new AppError(
      "bad_request",
      400,
      "Sandbox arg exceeds maximum length.",
    );
  }

  for (const needle of BLOCKED_SUBSTRINGS) {
    if (value.includes(needle)) {
      throw new AppError(
        "bad_request",
        400,
        "Sandbox command contains a blocked operation.",
      );
    }
  }

  const trimmed = value.trim();
  // Do not allow path traversal or homedir paths in any argument.
  // This is intentionally strict: it trades some flexibility for strong safety.
  if (trimmed.startsWith("~")) {
    throw new AppError(
      "bad_request",
      400,
      "Sandbox path must not start with ~.",
    );
  }

  // Reject any '..' path segment, even if it might be part of a non-path string.
  // The sandbox toolset should not need parent-directory reads/writes.
  if (/(^|\/)\.\.(\/|$)/.test(trimmed)) {
    throw new AppError(
      "bad_request",
      400,
      "Sandbox command contains a blocked path traversal segment.",
    );
  }

  // Block absolute paths outside the workspace root.
  if (trimmed.startsWith("/") && !trimmed.startsWith(SANDBOX_WORKSPACE_ROOT)) {
    throw new AppError(
      "bad_request",
      400,
      `Sandbox absolute paths must be within ${SANDBOX_WORKSPACE_ROOT}.`,
    );
  }
}

function stripPackageVersion(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "";

  // Scoped: @scope/name@version
  if (trimmed.startsWith("@")) {
    const lastAt = trimmed.lastIndexOf("@");
    const firstSlash = trimmed.indexOf("/");
    if (lastAt > 0 && lastAt > firstSlash) {
      return trimmed.slice(0, lastAt);
    }
    return trimmed;
  }

  // Unscoped: name@version
  const at = trimmed.indexOf("@");
  if (at > 0) return trimmed.slice(0, at);
  return trimmed;
}

function assertExecPackageAllowed(
  tool: "npx" | "bunx",
  args: readonly string[],
): void {
  let index = 0;
  while (index < args.length) {
    const token = args[index]?.trim();
    if (!token) break;
    if (EXEC_ALLOWED_LEADING_FLAGS.has(token)) {
      index += 1;
      continue;
    }
    break;
  }

  const raw = args[index]?.trim() ?? "";
  if (!raw) {
    throw new AppError(
      "bad_request",
      400,
      `${tool} requires an allowlisted package/bin name.`,
    );
  }
  if (raw === "--") {
    throw new AppError(
      "bad_request",
      400,
      `${tool} is restricted and does not support \`--\` passthrough.`,
    );
  }

  const pkg = stripPackageVersion(raw);
  if (!pkg || !EXEC_ALLOWED_PACKAGES.has(pkg)) {
    throw new AppError(
      "bad_request",
      400,
      `${tool} package/bin not allowed: ${pkg || raw}.`,
    );
  }
}

/**
 * Enforce the default-deny sandbox command policy.
 *
 * @param input - Command execution input.
 * @throws AppError - With code "bad_request" when command is not allowlisted.
 */
export function assertSandboxCommandAllowed(
  input: Readonly<{
    cmd: string;
    args?: readonly string[];
    policy: SandboxCommandPolicy;
  }>,
): void {
  const cmd = input.cmd.trim();

  const allowed =
    input.policy === "code_mode"
      ? CODE_MODE_ALLOWED_COMMANDS
      : IMPLEMENTATION_RUN_ALLOWED_COMMANDS;

  if (!allowed.has(cmd)) {
    throw new AppError("bad_request", 400, `Command not allowed: ${cmd}.`);
  }

  const args = input.args ?? [];
  if (args.length > MAX_ARGS) {
    throw new AppError(
      "bad_request",
      400,
      `Too many sandbox args (max ${MAX_ARGS}).`,
    );
  }

  for (const arg of args) {
    assertSafeArg(arg);
  }

  // Extra invariants for higher-risk commands.
  if (cmd === "npx") {
    assertExecPackageAllowed("npx", args);
  }

  if (cmd === "bunx") {
    assertExecPackageAllowed("bunx", args);
  }

  if (cmd === "pnpm") {
    const subcommand = args.at(0)?.trim();
    if (subcommand === "dlx") {
      throw new AppError(
        "bad_request",
        400,
        "Sandbox pnpm dlx is not allowed. Use bunx/npx (restricted) or repo scripts.",
      );
    }
  }

  if (cmd === "npm") {
    const subcommand = args.at(0)?.trim();
    if (subcommand === "exec" || subcommand === "x") {
      throw new AppError(
        "bad_request",
        400,
        "Sandbox npm exec is not allowed. Use bunx/npx (restricted) or repo scripts.",
      );
    }
  }

  // `find` can dispatch arbitrary commands via `-exec`/`-ok`-style flags. Since our
  // policy is structured `cmd + args` (not a shell), block these dispatchers
  // explicitly to prevent escaping the allowlist.
  if (cmd === "find") {
    for (const arg of args) {
      const trimmed = arg.trim();
      if (FIND_BLOCKED_FLAGS.has(trimmed)) {
        throw new AppError(
          "bad_request",
          400,
          `Sandbox find flag not allowed: ${trimmed}.`,
        );
      }
    }
  }
}
