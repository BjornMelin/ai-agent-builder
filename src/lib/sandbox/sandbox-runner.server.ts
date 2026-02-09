import "server-only";

import type { NetworkPolicy, Sandbox } from "@vercel/sandbox";

import type { SandboxJobDto } from "@/lib/data/sandbox-jobs.server";
import {
  createSandboxJob,
  updateSandboxJob,
} from "@/lib/data/sandbox-jobs.server";
import {
  assertSandboxCommandAllowed,
  type SandboxCommandPolicy,
} from "@/lib/sandbox/allowlist.server";
import {
  getSandboxTranscriptBlobPath,
  putSandboxTranscriptBlob,
} from "@/lib/sandbox/blob.server";
import { redactSandboxLog } from "@/lib/sandbox/redaction.server";
import {
  createVercelSandbox,
  getVercelSandbox,
} from "@/lib/sandbox/sandbox-client.server";
import type { SandboxTranscript } from "@/lib/sandbox/transcript.server";
import { SandboxTranscriptCollector } from "@/lib/sandbox/transcript.server";

type SandboxGitSource = Parameters<typeof createVercelSandbox>[0]["source"];

function formatTranscriptCommandHeader(
  input: Readonly<{
    cmd: string;
    args: readonly string[];
    cwd?: string;
    env?: Readonly<Record<string, string>>;
  }>,
): string {
  const safeArgs = input.args.map((arg) => redactSandboxLog(arg));
  const cmdLine = ["$", input.cmd, ...safeArgs].join(" ").trim();

  const envKeys = Object.keys(input.env ?? {}).filter((key) => key.length > 0);
  envKeys.sort();

  const lines = [
    cmdLine,
    ...(input.cwd ? [`# cwd: ${input.cwd}`] : []),
    ...(envKeys.length ? [`# env: ${envKeys.join(", ")}`] : []),
    "",
  ];

  return lines.join("\n");
}

export type SandboxRunnerCommand = Readonly<{
  cmd: string;
  args?: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  policy: SandboxCommandPolicy;
  /**
   * Secrets used for command execution (never persisted). Included here only so
   * transcript redaction can remove them reliably.
   */
  extraSecrets?: readonly string[];
  /**
   * Optional hook for streaming log output to a UI stream.
   *
   * @remarks
   * Called with redacted log chunks as they arrive.
   */
  onLog?: (
    entry: Readonly<{ stream: "stdout" | "stderr"; data: string }>,
  ) => void | Promise<void>;
}>;

export type SandboxJobSession = Readonly<{
  job: SandboxJobDto;
  sandbox: Sandbox;
  transcriptCollector: SandboxTranscriptCollector;
  runCommand: (
    command: SandboxRunnerCommand,
  ) => Promise<Readonly<{ exitCode: number; transcript: SandboxTranscript }>>;
  snapshotTranscript: () => SandboxTranscript;
  finalize: (input: Readonly<{ status: string; exitCode: number }>) => Promise<{
    job: SandboxJobDto;
    transcript: SandboxTranscript;
  }>;
  cancel: () => Promise<void>;
}>;

type RunnerDeps = Readonly<{
  createJob: typeof createSandboxJob;
  updateJob: typeof updateSandboxJob;
  createSandbox: typeof createVercelSandbox;
  getSandbox: typeof getVercelSandbox;
  putTranscriptBlob: typeof putSandboxTranscriptBlob;
  now: () => Date;
}>;

const defaultDeps: RunnerDeps = {
  createJob: createSandboxJob,
  createSandbox: createVercelSandbox,
  getSandbox: getVercelSandbox,
  now: () => new Date(),
  putTranscriptBlob: putSandboxTranscriptBlob,
  updateJob: updateSandboxJob,
};

/**
 * Start a sandbox job session with transcript capture.
 *
 * @remarks
 * This creates a `sandbox_jobs` record (pending → running), provisions a sandbox,
 * and returns helpers for allowlisted command execution + transcript persistence.
 *
 * @param input - Job + sandbox creation options.
 * @param deps - Dependency injection for tests.
 * @returns Session object.
 */
export async function startSandboxJobSession(
  input: Readonly<{
    projectId: string;
    runId: string;
    jobType: string;
    stepId?: string | null;
    status?: string;
    metadata?: Record<string, unknown>;
    networkPolicy: NetworkPolicy;
    runtime?: "node24" | "node22" | "python3.13";
    vcpus?: number;
    timeoutMs: number;
    ports?: number[];
    source?: SandboxGitSource;
    /**
     * Stop the sandbox when the job is finalized/canceled.
     *
     * @defaultValue true
     */
    stopOnFinalize?: boolean;
  }>,
  deps: Partial<RunnerDeps> = {},
): Promise<SandboxJobSession> {
  const resolved: RunnerDeps = { ...defaultDeps, ...deps };
  const collector = new SandboxTranscriptCollector();

  const job = await resolved.createJob({
    jobType: input.jobType,
    metadata: input.metadata ?? {},
    projectId: input.projectId,
    runId: input.runId,
    status: input.status ?? "pending",
    ...(input.stepId === undefined ? {} : { stepId: input.stepId }),
  });

  let sandbox: Sandbox | null = null;
  try {
    sandbox = await resolved.createSandbox({
      networkPolicy: input.networkPolicy,
      ...(input.ports === undefined ? {} : { ports: input.ports }),
      runtime: input.runtime ?? "node24",
      ...(input.source === undefined ? {} : { source: input.source }),
      timeoutMs: input.timeoutMs,
      vcpus: input.vcpus ?? 2,
    });
    const sandboxInstance = sandbox;

    const startedAt = resolved.now();
    const runningJob = await resolved.updateJob(job.id, {
      metadata: {
        sandboxId: sandboxInstance.sandboxId,
        ...(input.runtime ? { runtime: input.runtime } : {}),
        ...(input.vcpus ? { vcpus: input.vcpus } : {}),
      },
      startedAt,
      status: "running",
    });

    let finalized = false;
    let lastJob = runningJob;
    const stopOnFinalize = input.stopOnFinalize ?? true;

    const runCommand = async (
      command: SandboxRunnerCommand,
    ): Promise<
      Readonly<{ exitCode: number; transcript: SandboxTranscript }>
    > => {
      assertSandboxCommandAllowed({
        args: command.args ?? [],
        cmd: command.cmd,
        policy: command.policy,
      });

      const commandCollector = new SandboxTranscriptCollector();
      const header = formatTranscriptCommandHeader({
        args: command.args ?? [],
        cmd: command.cmd,
        ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
        ...(command.env === undefined ? {} : { env: command.env }),
      });
      const headerEntry = { data: header, stream: "stdout" as const };

      collector.append(headerEntry, {
        ...(command.extraSecrets ? { extraSecrets: command.extraSecrets } : {}),
      });
      commandCollector.append(headerEntry, {
        ...(command.extraSecrets ? { extraSecrets: command.extraSecrets } : {}),
      });

      const cmd = await sandboxInstance.runCommand({
        args: command.args ? [...command.args] : [],
        cmd: command.cmd,
        ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
        detached: true,
        ...(command.env === undefined ? {} : { env: { ...command.env } }),
      });

      const logsHandle = cmd.logs();
      try {
        for await (const entry of logsHandle) {
          const redacted = collector.append(entry, {
            ...(command.extraSecrets
              ? { extraSecrets: command.extraSecrets }
              : {}),
          });
          commandCollector.append(entry, {
            ...(command.extraSecrets
              ? { extraSecrets: command.extraSecrets }
              : {}),
          });
          await command.onLog?.({ data: redacted, stream: entry.stream });
        }
      } finally {
        try {
          logsHandle.close();
        } catch {
          // Ignore.
        }
      }

      const finished = await cmd.wait();
      return {
        exitCode: finished.exitCode,
        transcript: commandCollector.snapshot(),
      };
    };

    const snapshotTranscript = (): SandboxTranscript => collector.snapshot();

    const finalize = async (
      result: Readonly<{ status: string; exitCode: number }>,
    ) => {
      if (finalized) {
        return { job: lastJob, transcript: collector.snapshot() };
      }
      finalized = true;

      const transcript = collector.snapshot();
      let transcriptBlobRef: string | null = null;
      try {
        const blobPath = getSandboxTranscriptBlobPath({
          jobId: runningJob.id,
          projectId: input.projectId,
          runId: input.runId,
        });
        transcriptBlobRef = await resolved.putTranscriptBlob({
          blobPath,
          content: transcript.combined,
        });
      } catch {
        // Best effort only.
      }

      const endedAt = resolved.now();
      lastJob = await resolved.updateJob(runningJob.id, {
        endedAt,
        exitCode: result.exitCode,
        ...(transcriptBlobRef ? { transcriptBlobRef } : {}),
        status: result.status,
      });

      if (stopOnFinalize) {
        try {
          await sandboxInstance.stop();
        } catch {
          // Ignore.
        }
      }

      return { job: lastJob, transcript };
    };

    const cancel = async () => {
      if (finalized) return;
      finalized = true;

      if (stopOnFinalize) {
        try {
          await sandboxInstance.stop();
        } catch {
          // Ignore.
        }
      }

      lastJob = await resolved.updateJob(runningJob.id, {
        endedAt: resolved.now(),
        status: "canceled",
      });
    };

    return {
      cancel,
      finalize,
      job: runningJob,
      runCommand,
      sandbox: sandboxInstance,
      snapshotTranscript,
      transcriptCollector: collector,
    };
  } catch (err) {
    try {
      if (sandbox) {
        await sandbox.stop();
      }
    } catch {
      // Ignore.
    }
    try {
      await resolved.updateJob(job.id, {
        endedAt: resolved.now(),
        status: "failed",
      });
    } catch {
      // Ignore.
    }
    throw err;
  }
}

/**
 * Attach to an existing sandbox and record it as a sandbox job session.
 *
 * @remarks
 * This is used when multiple durable steps share the same sandbox (e.g.
 * implementation runs reusing a repo checkout across patch + verify steps).
 * It persists a `sandbox_jobs` record for transcript capture without creating
 * a new sandbox.
 *
 * @param input - Existing sandbox identity + job metadata.
 * @param deps - Dependency injection for tests.
 * @returns Session object bound to the existing sandbox.
 */
export async function attachSandboxJobSession(
  input: Readonly<{
    projectId: string;
    runId: string;
    sandboxId: string;
    jobType: string;
    stepId?: string | null;
    status?: string;
    metadata?: Record<string, unknown>;
    /**
     * Stop the sandbox when the job is finalized/canceled.
     *
     * @defaultValue false
     */
    stopOnFinalize?: boolean;
  }>,
  deps: Partial<RunnerDeps> = {},
): Promise<SandboxJobSession> {
  const resolved: RunnerDeps = { ...defaultDeps, ...deps };
  const collector = new SandboxTranscriptCollector();

  const job = await resolved.createJob({
    jobType: input.jobType,
    metadata: input.metadata ?? {},
    projectId: input.projectId,
    runId: input.runId,
    status: input.status ?? "pending",
    ...(input.stepId === undefined ? {} : { stepId: input.stepId }),
  });

  const sandbox = await resolved.getSandbox(input.sandboxId);
  const stopOnFinalize = input.stopOnFinalize ?? false;

  const startedAt = resolved.now();
  const runningJob = await resolved.updateJob(job.id, {
    metadata: {
      sandboxId: sandbox.sandboxId,
    },
    startedAt,
    status: "running",
  });

  let finalized = false;
  let lastJob = runningJob;

  const runCommand = async (
    command: SandboxRunnerCommand,
  ): Promise<Readonly<{ exitCode: number; transcript: SandboxTranscript }>> => {
    assertSandboxCommandAllowed({
      args: command.args ?? [],
      cmd: command.cmd,
      policy: command.policy,
    });

    const commandCollector = new SandboxTranscriptCollector();
    const header = formatTranscriptCommandHeader({
      args: command.args ?? [],
      cmd: command.cmd,
      ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
      ...(command.env === undefined ? {} : { env: command.env }),
    });
    const headerEntry = { data: header, stream: "stdout" as const };

    collector.append(headerEntry, {
      ...(command.extraSecrets ? { extraSecrets: command.extraSecrets } : {}),
    });
    commandCollector.append(headerEntry, {
      ...(command.extraSecrets ? { extraSecrets: command.extraSecrets } : {}),
    });

    const cmd = await sandbox.runCommand({
      args: command.args ? [...command.args] : [],
      cmd: command.cmd,
      ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
      detached: true,
      ...(command.env === undefined ? {} : { env: { ...command.env } }),
    });

    const logsHandle = cmd.logs();
    try {
      for await (const entry of logsHandle) {
        const redacted = collector.append(entry, {
          ...(command.extraSecrets
            ? { extraSecrets: command.extraSecrets }
            : {}),
        });
        commandCollector.append(entry, {
          ...(command.extraSecrets
            ? { extraSecrets: command.extraSecrets }
            : {}),
        });
        await command.onLog?.({ data: redacted, stream: entry.stream });
      }
    } finally {
      try {
        logsHandle.close();
      } catch {
        // Ignore.
      }
    }

    const finished = await cmd.wait();
    return {
      exitCode: finished.exitCode,
      transcript: commandCollector.snapshot(),
    };
  };

  const snapshotTranscript = (): SandboxTranscript => collector.snapshot();

  const finalize = async (
    result: Readonly<{ status: string; exitCode: number }>,
  ) => {
    if (finalized) {
      return { job: lastJob, transcript: collector.snapshot() };
    }
    finalized = true;

    const transcript = collector.snapshot();
    let transcriptBlobRef: string | null = null;
    try {
      const blobPath = getSandboxTranscriptBlobPath({
        jobId: runningJob.id,
        projectId: input.projectId,
        runId: input.runId,
      });
      transcriptBlobRef = await resolved.putTranscriptBlob({
        blobPath,
        content: transcript.combined,
      });
    } catch {
      // Best effort only.
    }

    const endedAt = resolved.now();
    lastJob = await resolved.updateJob(runningJob.id, {
      endedAt,
      exitCode: result.exitCode,
      ...(transcriptBlobRef ? { transcriptBlobRef } : {}),
      status: result.status,
    });

    if (stopOnFinalize) {
      try {
        await sandbox.stop();
      } catch {
        // Ignore.
      }
    }

    return { job: lastJob, transcript };
  };

  const cancel = async () => {
    if (finalized) return;
    finalized = true;

    if (stopOnFinalize) {
      try {
        await sandbox.stop();
      } catch {
        // Ignore.
      }
    }

    lastJob = await resolved.updateJob(runningJob.id, {
      endedAt: resolved.now(),
      status: "canceled",
    });
  };

  return {
    cancel,
    finalize,
    job: runningJob,
    runCommand,
    sandbox,
    snapshotTranscript,
    transcriptCollector: collector,
  };
}
