import "server-only";

import { AppError } from "@/lib/core/errors";

export type SandboxCommandPolicy = "code_mode" | "implementation_run";

const CODE_MODE_ALLOWED_COMMANDS: ReadonlySet<string> = new Set<string>([
  "bun",
  "cat",
  "find",
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
  "which",
]);

const IMPLEMENTATION_RUN_ALLOWED_COMMANDS: ReadonlySet<string> =
  new Set<string>([
    "bun",
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
    const first = args.at(0);
    if (first !== "tsx") {
      throw new AppError(
        "bad_request",
        400,
        "Sandbox npx is restricted to `npx tsx <script>`.",
      );
    }
  }
}
