import { vi } from "vitest";

export type ScriptedTranscript = Readonly<{
  combined: string;
  stderr: string;
  stdout: string;
}>;

export type ScriptedCommandResult = Readonly<{
  exitCode: number;
  transcript: ScriptedTranscript;
}>;

export type ScriptedFinalizeResult = Readonly<{
  job: Readonly<{ id: string; transcriptBlobRef: string | null }>;
  transcript: Readonly<{ truncated: boolean }>;
}>;

export type ScriptedSandboxSession = Readonly<{
  finalize: (
    input: Readonly<{ exitCode: number; status: string }>,
  ) => Promise<ScriptedFinalizeResult>;
  runCommand: (
    input: Readonly<Record<string, unknown>>,
  ) => Promise<ScriptedCommandResult>;
  sandbox: Readonly<{
    sandboxId: string;
    stop: () => Promise<void>;
    writeFiles: (
      files: readonly Readonly<{ content: Buffer; path: string }>[],
    ) => Promise<void>;
  }>;
}>;

function normalizeTranscript(
  partial?: Partial<ScriptedTranscript>,
): ScriptedTranscript {
  const stdout = partial?.stdout ?? "";
  const stderr = partial?.stderr ?? "";
  const combined =
    partial?.combined ?? (stdout || stderr ? `${stdout}${stderr}` : "");
  return { combined, stderr, stdout };
}

/**
 * Create a successful sandbox command result.
 *
 * @param transcript - Optional transcript fields (stdout/stderr/combined).
 * @returns A `ScriptedCommandResult` with exit code 0.
 */
export function ok(
  transcript?: Partial<ScriptedTranscript>,
): ScriptedCommandResult {
  return { exitCode: 0, transcript: normalizeTranscript(transcript) };
}

/**
 * Create a failed sandbox command result.
 *
 * @param input - Optional exit code and transcript fields.
 * @returns A `ScriptedCommandResult` with non-zero exit code.
 */
export function fail(
  input?: Readonly<{
    exitCode?: number;
    transcript?: Partial<ScriptedTranscript>;
  }>,
): ScriptedCommandResult {
  return {
    exitCode: input?.exitCode ?? 1,
    transcript: normalizeTranscript(input?.transcript),
  };
}

/**
 * Match a sandbox `runCommand` call by `cmd` and substrings in `args`.
 *
 * @param cmd - Expected command.
 * @param argsSubstrings - Substrings that must be present in `JSON.stringify(args)`.
 * @returns A predicate suitable for scripted sessions.
 */
export function matchCmd(
  cmd: string,
  argsSubstrings?: readonly string[],
): (input: Readonly<Record<string, unknown>>) => boolean {
  return (input) => {
    if (input.cmd !== cmd) return false;
    if (!argsSubstrings || argsSubstrings.length === 0) return true;
    const argsStr = JSON.stringify(input.args ?? null);
    return argsSubstrings.every((s) => argsStr.includes(s));
  };
}

/**
 * Create a mocked sandbox job session whose `runCommand` results are driven by a script.
 *
 * @param steps - Matchers + results for specific commands.
 * @param options - Optional default result for unmatched commands (defaults to `ok()`).
 * @returns A `ScriptedSandboxSession` with `runCommand` + `finalize` mocks.
 */
export function makeScriptedSession(
  steps: ReadonlyArray<
    Readonly<{
      match: (input: Readonly<Record<string, unknown>>) => boolean;
      result: ScriptedCommandResult;
    }>
  >,
  options?: Readonly<{ defaultResult?: ScriptedCommandResult }>,
): ScriptedSandboxSession {
  const defaultResult = options?.defaultResult ?? ok();

  const runCommand = vi.fn(async (input: Readonly<Record<string, unknown>>) => {
    const step = steps.find((s) => s.match(input));
    return step?.result ?? defaultResult;
  });

  return {
    finalize: vi.fn(async () => ({
      job: { id: "job_1", transcriptBlobRef: "blob_1" },
      transcript: { truncated: false },
    })),
    runCommand,
    sandbox: {
      sandboxId: "sb_1",
      stop: vi.fn(async () => {}),
      writeFiles: vi.fn(async () => {}),
    },
  };
}
