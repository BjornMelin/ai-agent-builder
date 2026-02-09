import type { ToolExecutionOptions } from "ai";
import { z } from "zod";

import { AppError } from "@/lib/core/errors";
import { redactSandboxLog } from "@/lib/sandbox/redaction.server";
import { getVercelSandbox } from "@/lib/sandbox/sandbox-client.server";
import { parseCodeModeToolContext } from "@/workflows/code-mode/tool-context";

const MAX_OUTPUT_CHARS = 20_000;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 120_000;

const resolveSandboxCwd = (raw: string | undefined): string | undefined => {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Default to /vercel/sandbox for relative paths.
  if (!trimmed.startsWith("/")) {
    if (trimmed.includes("..")) {
      throw new AppError("bad_request", 400, "Invalid cwd.");
    }
    return `/vercel/sandbox/${trimmed}`.replaceAll("//", "/");
  }

  if (!trimmed.startsWith("/vercel/sandbox")) {
    throw new AppError(
      "bad_request",
      400,
      "cwd must be within /vercel/sandbox.",
    );
  }
  if (trimmed.includes("..")) {
    throw new AppError("bad_request", 400, "Invalid cwd.");
  }

  return trimmed;
};

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[output truncated]\n`;
}

function redactAndTruncate(value: string): string {
  return truncate(redactSandboxLog(value), MAX_OUTPUT_CHARS);
}

async function runSandboxCommand(
  input: Readonly<{
    sandboxId: string;
    cmd: string;
    args?: readonly string[] | undefined;
    cwd?: string | undefined;
    timeoutMs?: number | undefined;
  }>,
  options: ToolExecutionOptions,
): Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>> {
  const sandbox = await getVercelSandbox(input.sandboxId);
  const cmd = input.cmd.trim();
  const args = input.args ? Array.from(input.args) : [];
  const cwd = resolveSandboxCwd(input.cwd);

  const timeoutMs = Math.min(
    Math.max(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1),
    MAX_TIMEOUT_MS,
  );

  // Enforce default-deny policy for all sandbox commands invoked via tools.
  const { assertSandboxCommandAllowed } = await import(
    "@/lib/sandbox/allowlist.server"
  );
  assertSandboxCommandAllowed({ args, cmd, policy: "code_mode" });

  const controller = new AbortController();
  let didTimeout = false;
  const cleanupFns: Array<() => void> = [];

  if (options.abortSignal) {
    const abortSignal = options.abortSignal;
    const onAbort = () => controller.abort(abortSignal.reason);
    abortSignal.addEventListener("abort", onAbort, { once: true });
    cleanupFns.push(() => abortSignal.removeEventListener("abort", onAbort));
  }

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort(new Error("Sandbox command timed out."));
  }, timeoutMs);
  cleanupFns.push(() => clearTimeout(timeoutId));

  try {
    const res = await sandbox.runCommand({
      args,
      cmd,
      ...(cwd === undefined ? {} : { cwd }),
      signal: controller.signal,
    });

    const [stdout, stderr] = await Promise.all([res.stdout(), res.stderr()]);

    return {
      exitCode: res.exitCode,
      stderr: redactAndTruncate(stderr),
      stdout: redactAndTruncate(stdout),
    };
  } catch (error) {
    if (didTimeout) {
      throw new AppError("upstream_timeout", 504, "Sandbox command timed out.");
    }
    if (controller.signal.aborted) {
      throw new AppError(
        "aborted",
        499,
        "Operation aborted.",
        controller.signal.reason,
      );
    }
    throw error;
  } finally {
    for (const fn of cleanupFns) fn();
  }
}

const execInputSchema = z.strictObject({
  args: z.array(z.string().min(1)).max(64).optional(),
  cmd: z.string().min(1),
  cwd: z.string().min(1).optional(),
  timeoutMs: z.number().int().min(1).max(MAX_TIMEOUT_MS).optional(),
});

/**
 * Sandbox exec tool (default-deny allowlist).
 *
 * @param input - Tool input.
 * @param options - Tool execution options (includes experimental_context).
 * @returns Command result.
 */
export async function sandboxExecStep(
  input: Readonly<{
    cmd: string;
    args?: readonly string[] | undefined;
    cwd?: string | undefined;
    timeoutMs?: number | undefined;
  }>,
  options: ToolExecutionOptions,
): Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>> {
  "use step";

  const parsed = execInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("bad_request", 400, "Invalid sandbox exec input.");
  }

  const ctx = parseCodeModeToolContext(options.experimental_context);
  ctx.toolBudget.execCalls += 1;

  return await runSandboxCommand(
    {
      args: parsed.data.args,
      cmd: parsed.data.cmd,
      cwd: parsed.data.cwd,
      sandboxId: ctx.sandboxId,
      timeoutMs: parsed.data.timeoutMs,
    },
    options,
  );
}

const lsInputSchema = z.strictObject({
  path: z.string().min(1).optional(),
});

/**
 * List directory contents within the sandbox workspace.
 *
 * @param input - Step input.
 * @param options - Workflow tool execution options.
 * @returns Directory listing.
 */
export async function sandboxLsStep(
  input: Readonly<{ path?: string | undefined }>,
  options: ToolExecutionOptions,
): Promise<Readonly<{ output: string }>> {
  "use step";

  const parsed = lsInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("bad_request", 400, "Invalid ls input.");
  }

  const path = parsed.data.path?.trim();
  const args = path ? ["-la", path] : ["-la"];
  const result = await sandboxExecStep({ args, cmd: "ls" }, options);
  return { output: result.stdout };
}

const catInputSchema = z.strictObject({
  path: z.string().min(1),
});

/**
 * Read a file within the sandbox workspace (bounded + redacted).
 *
 * @param input - Step input.
 * @param options - Workflow tool execution options.
 * @returns File contents.
 */
export async function sandboxCatStep(
  input: Readonly<{ path: string }>,
  options: ToolExecutionOptions,
): Promise<Readonly<{ output: string }>> {
  "use step";

  const parsed = catInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("bad_request", 400, "Invalid cat input.");
  }

  const ctx = parseCodeModeToolContext(options.experimental_context);
  ctx.toolBudget.readCalls += 1;

  const result = await sandboxExecStep(
    { args: [parsed.data.path], cmd: "cat" },
    options,
  );
  return { output: result.stdout };
}

const rgInputSchema = z.strictObject({
  path: z.string().min(1).optional(),
  pattern: z.string().min(1),
});

/**
 * Ripgrep search within the sandbox workspace.
 *
 * @param input - Step input.
 * @param options - Workflow tool execution options.
 * @returns Search output.
 */
export async function sandboxRgStep(
  input: Readonly<{ pattern: string; path?: string | undefined }>,
  options: ToolExecutionOptions,
): Promise<Readonly<{ output: string }>> {
  "use step";

  const parsed = rgInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("bad_request", 400, "Invalid rg input.");
  }

  const args = ["-n", parsed.data.pattern];
  if (parsed.data.path) args.push(parsed.data.path);

  const result = await sandboxExecStep({ args, cmd: "rg" }, options);
  return { output: result.stdout };
}

const findInputSchema = z.strictObject({
  maxDepth: z.number().int().min(1).max(8).optional(),
  name: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
});

/**
 * Find files within the sandbox workspace (bounded).
 *
 * @param input - Step input.
 * @param options - Workflow tool execution options.
 * @returns Find output.
 */
export async function sandboxFindStep(
  input: Readonly<{
    path?: string | undefined;
    name?: string | undefined;
    maxDepth?: number | undefined;
  }>,
  options: ToolExecutionOptions,
): Promise<Readonly<{ output: string }>> {
  "use step";

  const parsed = findInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("bad_request", 400, "Invalid find input.");
  }

  const args: string[] = [];
  if (parsed.data.path) {
    args.push(parsed.data.path);
  }
  if (parsed.data.maxDepth) {
    args.push("-maxdepth", String(parsed.data.maxDepth));
  }
  if (parsed.data.name) {
    args.push("-name", parsed.data.name);
  }

  const result = await sandboxExecStep({ args, cmd: "find" }, options);
  return { output: result.stdout };
}
