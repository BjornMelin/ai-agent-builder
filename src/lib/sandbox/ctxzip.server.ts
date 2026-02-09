import "server-only";

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ToolSet } from "ai";
import type {
  FileAdapter,
  MCPServerConfig,
  SandboxCodeModeOptions,
  SandboxManager,
  SandboxProvider,
} from "ctx-zip";

type SandboxManagerConstructor = typeof import("ctx-zip")["SandboxManager"];

let sandboxManagerConstructorPromise: Promise<SandboxManagerConstructor> | null =
  null;

async function getCtxZipSandboxManagerConstructor(): Promise<SandboxManagerConstructor> {
  if (!sandboxManagerConstructorPromise) {
    sandboxManagerConstructorPromise = (async () => {
      // `ctx-zip` root import is currently broken under strict ESM resolution due to
      // `./tool-results-compactor/index.js` importing `./compact` without an extension.
      // We only need the sandbox-code-generator side, so we load it directly by path.
      const require = createRequire(import.meta.url);
      const ctxZipEntryPath = require.resolve("ctx-zip");
      const sandboxCodeGenEntryPath = path.join(
        path.dirname(ctxZipEntryPath),
        "sandbox-code-generator",
        "index.js",
      );

      const mod = (await import(
        pathToFileURL(sandboxCodeGenEntryPath).href
      )) as unknown;

      if (
        !mod ||
        typeof mod !== "object" ||
        !("SandboxManager" in mod) ||
        typeof (mod as { SandboxManager?: unknown }).SandboxManager !==
          "function"
      ) {
        throw new Error("Failed to load ctx-zip SandboxManager.");
      }

      return (mod as { SandboxManager: SandboxManagerConstructor })
        .SandboxManager;
    })();
  }

  return await sandboxManagerConstructorPromise;
}

type ConsoleMethod = "debug" | "error" | "info" | "log" | "warn";

type ConsoleEntry = Readonly<{
  level: ConsoleMethod;
  args: readonly unknown[];
}>;

type ConsoleSink = (entry: ConsoleEntry) => void;

const CTX_ZIP_STACK_MARKERS = [
  "/node_modules/ctx-zip/",
  "\\node_modules\\ctx-zip\\",
] as const;

type PatchedConsole = Readonly<{
  debug: typeof console.debug;
  error: typeof console.error;
  info: typeof console.info;
  log: typeof console.log;
  warn: typeof console.warn;
}>;

let activeConsolePatchCount = 0;
let patchedConsole: PatchedConsole | null = null;
const activeConsoleSinks = new Set<ConsoleSink>();

function isCtxZipCallSite(stack: string | undefined): boolean {
  if (!stack) return false;
  return CTX_ZIP_STACK_MARKERS.some((marker) => stack.includes(marker));
}

function patchConsoleForCtxZip(): void {
  activeConsolePatchCount += 1;
  if (activeConsolePatchCount !== 1) return;

  patchedConsole = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };

  const wrap =
    (level: ConsoleMethod, original: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      const stack = new Error().stack;
      if (isCtxZipCallSite(stack)) {
        for (const sink of activeConsoleSinks) {
          sink({ args, level });
        }
        return;
      }
      Reflect.apply(original, console, args);
    };

  console.debug = wrap("debug", patchedConsole.debug);
  console.error = wrap("error", patchedConsole.error);
  console.info = wrap("info", patchedConsole.info);
  console.log = wrap("log", patchedConsole.log);
  console.warn = wrap("warn", patchedConsole.warn);
}

function unpatchConsoleForCtxZip(): void {
  if (activeConsolePatchCount === 0) return;
  activeConsolePatchCount -= 1;
  if (activeConsolePatchCount !== 0) return;

  if (patchedConsole) {
    console.debug = patchedConsole.debug;
    console.error = patchedConsole.error;
    console.info = patchedConsole.info;
    console.log = patchedConsole.log;
    console.warn = patchedConsole.warn;
  }

  patchedConsole = null;
}

async function withCtxZipConsoleSuppressed<T>(
  fn: () => Promise<T>,
  sink?: ConsoleSink,
): Promise<T> {
  patchConsoleForCtxZip();
  if (sink) activeConsoleSinks.add(sink);

  try {
    return await fn();
  } finally {
    if (sink) activeConsoleSinks.delete(sink);
    unpatchConsoleForCtxZip();
  }
}

type SandboxCommand = Readonly<{
  cmd: string;
  args: readonly string[];
}>;

type SandboxFile = Readonly<{
  path: string;
  content: Buffer;
}>;

type CommandResult = Readonly<{
  exitCode: number;
  stdout: () => Promise<string>;
  stderr: () => Promise<string>;
}>;

/**
 * Minimal surface area we need from a Vercel Sandbox instance.
 *
 * @remarks
 * This keeps the wrapper testable without requiring real Sandbox credentials.
 */
export type VercelSandboxLike = Readonly<{
  sandboxId: string;
  runCommand: (
    params: Readonly<{ cmd: string; args?: readonly string[] }>,
  ) => Promise<CommandResult>;
  stop: () => Promise<void>;
  writeFiles: (files: readonly SandboxFile[]) => Promise<void>;
}>;

/**
 * Interceptors for sandbox operations performed by ctx-zip tools/manager.
 */
export type CtxZipSandboxInterceptors = Readonly<{
  /**
   * Intercept (and optionally rewrite) sandbox commands before execution.
   *
   * @throws To block execution (e.g. allowlist violation).
   */
  onBeforeCommand?: (
    command: SandboxCommand,
  ) => Promise<SandboxCommand | undefined> | SandboxCommand | undefined;
  /**
   * Intercept command output before it is returned to the caller.
   *
   * @remarks
   * This is useful for redaction and log hygiene. It is applied when a tool
   * calls `stdout()`/`stderr()`.
   */
  onAfterCommandOutput?: (
    input: Readonly<{
      command: SandboxCommand;
      output: string;
      stream: "stdout" | "stderr";
    }>,
  ) => Promise<string> | string;
  /**
   * Intercept (and optionally rewrite) files before they are written to the sandbox.
   *
   * @throws To block writes (e.g. path policy violation).
   */
  onBeforeWriteFiles?: (
    files: readonly SandboxFile[],
  ) =>
    | Promise<readonly SandboxFile[] | undefined>
    | readonly SandboxFile[]
    | undefined;
}>;

/**
 * A ctx-zip code-mode session bound to an existing Vercel Sandbox instance.
 */
export type CtxZipSandboxCodeModeSession = Readonly<{
  /**
   * AI SDK tools (exploration + execution) generated by ctx-zip.
   */
  tools: ToolSet;
  /**
   * Underlying ctx-zip manager (advanced operations, file adapter access).
   *
   * @remarks
   * `cleanup()` is patched to suppress ctx-zip console spam.
   */
  manager: SandboxManager;
}>;

class ExistingVercelSandboxProvider implements SandboxProvider {
  private readonly id: string;

  public constructor(
    private readonly sandbox: VercelSandboxLike,
    private readonly options: Readonly<{
      interceptors?: CtxZipSandboxInterceptors;
      stopOnCleanup: boolean;
      workspacePath: string;
    }>,
  ) {
    this.id = `vercel-sandbox-${sandbox.sandboxId}`;
  }

  public async writeFiles(files: SandboxFile[]): Promise<void> {
    const rewritten =
      (await this.options.interceptors?.onBeforeWriteFiles?.(files)) ?? files;
    await this.sandbox.writeFiles(rewritten);
  }

  public async runCommand(command: {
    cmd: string;
    args: string[];
  }): Promise<CommandResult> {
    const baseCommand: SandboxCommand = {
      args: command.args,
      cmd: command.cmd,
    };

    const intercepted =
      (await this.options.interceptors?.onBeforeCommand?.(baseCommand)) ??
      baseCommand;

    // Ensure we pass plain arrays to `@vercel/sandbox`.
    const cmd = intercepted.cmd;
    const args = [...intercepted.args];

    const result = await this.sandbox.runCommand({ args, cmd });

    const redactor = this.options.interceptors?.onAfterCommandOutput;
    if (!redactor) return result;

    let cachedStdout: string | null = null;
    let cachedStderr: string | null = null;

    return {
      exitCode: result.exitCode,
      stderr: async () => {
        if (cachedStderr !== null) return cachedStderr;
        const raw = await result.stderr();
        const next = await redactor({
          command: intercepted,
          output: raw,
          stream: "stderr",
        });
        cachedStderr = next;
        return next;
      },
      stdout: async () => {
        if (cachedStdout !== null) return cachedStdout;
        const raw = await result.stdout();
        const next = await redactor({
          command: intercepted,
          output: raw,
          stream: "stdout",
        });
        cachedStdout = next;
        return next;
      },
    };
  }

  public async stop(): Promise<void> {
    if (!this.options.stopOnCleanup) return;
    await this.sandbox.stop();
  }

  public getId(): string {
    return this.id;
  }

  public getWorkspacePath(): string {
    return this.options.workspacePath;
  }
}

/**
 * Create a ctx-zip code-mode manager/tools bound to an *existing* Vercel Sandbox instance.
 *
 * @remarks
 * This wrapper avoids `createVercelSandboxCodeMode()` because that API creates its own sandbox
 * (and logs noisily). We bind to a sandbox created via the repo's env contract instead.
 *
 * Console noise from ctx-zip is suppressed by default (filtered to ctx-zip callsites).
 *
 * @param input - Session configuration.
 * @returns Tools + manager instance.
 */
export async function createCtxZipSandboxCodeMode(
  input: Readonly<{
    /**
     * Existing sandbox instance (created elsewhere).
     */
    sandbox: VercelSandboxLike;
    /**
     * Workspace root inside the sandbox.
     *
     * @defaultValue "/vercel/sandbox"
     */
    workspacePath?: string;
    /**
     * Stop the underlying sandbox when `manager.cleanup()` is called.
     *
     * @defaultValue true
     */
    stopOnCleanup?: boolean;
    /**
     * MCP servers to register (optional).
     */
    servers?: readonly MCPServerConfig[];
    /**
     * Standard AI SDK tools to register (optional).
     */
    standardTools?: SandboxCodeModeOptions["standardTools"];
    /**
     * Standard tool code generation options (optional).
     */
    standardToolOptions?: SandboxCodeModeOptions["standardToolOptions"];
    /**
     * Hooks to intercept command/file operations for allowlists and redaction.
     */
    interceptors?: CtxZipSandboxInterceptors;
    /**
     * Route suppressed ctx-zip console entries somewhere else (optional).
     */
    consoleSink?: ConsoleSink;
  }>,
): Promise<CtxZipSandboxCodeModeSession> {
  const provider = new ExistingVercelSandboxProvider(input.sandbox, {
    ...(input.interceptors ? { interceptors: input.interceptors } : {}),
    stopOnCleanup: input.stopOnCleanup ?? true,
    workspacePath: input.workspacePath ?? "/vercel/sandbox",
  });

  const SandboxManagerCtor = await getCtxZipSandboxManagerConstructor();
  const manager = await withCtxZipConsoleSuppressed(
    async () => await SandboxManagerCtor.create({ sandboxProvider: provider }),
    input.consoleSink,
  );

  const servers = input.servers ?? [];
  const standardTools = input.standardTools ?? {};

  if (servers.length > 0 || Object.keys(standardTools).length > 0) {
    await withCtxZipConsoleSuppressed(
      async () =>
        await manager.register({
          ...(servers.length > 0 ? { servers: [...servers] } : {}),
          ...(Object.keys(standardTools).length > 0 ? { standardTools } : {}),
          ...(input.standardToolOptions === undefined
            ? {}
            : { standardToolOptions: input.standardToolOptions }),
        }),
      input.consoleSink,
    );
  }

  // Patch noisy ctx-zip instance methods so callers don't accidentally leak spam.
  const cleanup = manager.cleanup.bind(manager);
  manager.cleanup = async () =>
    await withCtxZipConsoleSuppressed(cleanup, input.consoleSink);

  const displayFileSystemTree = manager.displayFileSystemTree.bind(manager);
  manager.displayFileSystemTree = async () =>
    await withCtxZipConsoleSuppressed(displayFileSystemTree, input.consoleSink);

  const register = manager.register.bind(manager);
  manager.register = async (options) =>
    await withCtxZipConsoleSuppressed(
      async () => await register(options),
      input.consoleSink,
    );

  return { manager, tools: manager.getAllTools() };
}

/**
 * Create a ctx-zip manager + file adapter for an existing sandbox by ID.
 *
 * @remarks
 * This is primarily used for message compaction (`strategy: "write-tool-results-to-file"`)
 * where ctx-zip needs a storage adapter bound to the sandbox filesystem.
 *
 * @param sandboxId - Existing sandbox ID.
 * @param sessionId - Session ID for namespacing tool result files.
 * @param options - Optional interceptors and routing for ctx-zip console spam.
 * @returns ctx-zip manager and file adapter bound to the sandbox.
 */
export async function createCtxZipManagerForSandboxId(
  sandboxId: string,
  sessionId: string,
  options: Readonly<{
    interceptors?: CtxZipSandboxInterceptors;
    consoleSink?: ConsoleSink;
  }> = {},
): Promise<Readonly<{ manager: SandboxManager; fileAdapter: FileAdapter }>> {
  const { getVercelSandbox } = await import(
    "@/lib/sandbox/sandbox-client.server"
  );
  const sandbox = await getVercelSandbox(sandboxId);

  const sandboxLike: VercelSandboxLike = {
    runCommand: async ({ cmd, args }) => {
      const safeArgs = [...(args ?? [])];
      const result = await sandbox.runCommand({ args: safeArgs, cmd });
      return {
        exitCode: result.exitCode,
        stderr: async () => await result.stderr(),
        stdout: async () => await result.stdout(),
      };
    },
    sandboxId: sandbox.sandboxId,
    stop: async () => {
      await sandbox.stop();
    },
    writeFiles: async (files) => {
      await sandbox.writeFiles(
        files.map((file) => ({ content: file.content, path: file.path })),
      );
    },
  };

  const { manager } = await createCtxZipSandboxCodeMode({
    ...(options.consoleSink ? { consoleSink: options.consoleSink } : {}),
    ...(options.interceptors ? { interceptors: options.interceptors } : {}),
    sandbox: sandboxLike,
    stopOnCleanup: false,
  });

  const fileAdapter = manager.getFileAdapter({ sessionId });
  return { fileAdapter, manager };
}
