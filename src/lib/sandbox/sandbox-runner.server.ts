import "server-only";

import type { NetworkPolicy, Sandbox } from "@vercel/sandbox";
import { RetryableError } from "workflow";

import { AppError } from "@/lib/core/errors";
import type { SandboxJobDto } from "@/lib/data/sandbox-jobs.server";
import {
  activateSandboxJob,
  claimSandboxJobProvisioning,
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
  cancelProvisionedSandboxJob,
  stopRunOwnedSandbox,
} from "@/lib/sandbox/sandbox-cancellation.server";
import {
  createVercelSandbox,
  getVercelSandbox,
} from "@/lib/sandbox/sandbox-client.server";
import type { SandboxTranscript } from "@/lib/sandbox/transcript.server";
import { SandboxTranscriptCollector } from "@/lib/sandbox/transcript.server";

const DEFAULT_CREATE_TIMEOUT_MS = 20_000;

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
  return [
    cmdLine,
    ...(input.cwd ? [`# cwd: ${input.cwd}`] : []),
    ...(envKeys.length ? [`# env: ${envKeys.join(", ")}`] : []),
    "",
  ].join("\n");
}

export type SandboxRunnerCommand = Readonly<{
  cmd: string;
  args?: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  policy: SandboxCommandPolicy;
  /** Secrets used for execution and transcript redaction, never persistence. */
  extraSecrets?: readonly string[];
  /** Receives redacted log chunks as they arrive. */
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
  /** Stop the run-owned sandbox through the durable bounded stop owner. */
  stop: () => Promise<void>;
}>;

type RunnerDeps = Readonly<{
  activateJob: typeof activateSandboxJob;
  cancelProvisionedJob: typeof cancelProvisionedSandboxJob;
  claimProvisioning: typeof claimSandboxJobProvisioning;
  createJob: typeof createSandboxJob;
  createSandbox: typeof createVercelSandbox;
  createTimeoutMs: number;
  getSandbox: typeof getVercelSandbox;
  now: () => Date;
  putTranscriptBlob: typeof putSandboxTranscriptBlob;
  stopOwnedSandbox: typeof stopRunOwnedSandbox;
  updateJob: typeof updateSandboxJob;
}>;

const defaultDeps: RunnerDeps = {
  activateJob: activateSandboxJob,
  cancelProvisionedJob: cancelProvisionedSandboxJob,
  claimProvisioning: claimSandboxJobProvisioning,
  createJob: createSandboxJob,
  createSandbox: createVercelSandbox,
  createTimeoutMs: DEFAULT_CREATE_TIMEOUT_MS,
  getSandbox: getVercelSandbox,
  now: () => new Date(),
  putTranscriptBlob: putSandboxTranscriptBlob,
  stopOwnedSandbox: stopRunOwnedSandbox,
  updateJob: updateSandboxJob,
};

type SessionInput = Readonly<{
  job: SandboxJobDto;
  projectId: string;
  runId: string;
  sandbox: Sandbox;
  stopOnFinalize: boolean;
}>;

function createOperationSignal(
  timeoutMs: number,
  signal?: AbortSignal,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function createRunCommand(
  sandbox: Sandbox,
  collector: SandboxTranscriptCollector,
): SandboxJobSession["runCommand"] {
  return async (command) => {
    assertSandboxCommandAllowed({
      args: command.args ?? [],
      cmd: command.cmd,
      policy: command.policy,
    });

    const commandCollector = new SandboxTranscriptCollector();
    const headerEntry = {
      data: formatTranscriptCommandHeader({
        args: command.args ?? [],
        cmd: command.cmd,
        ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
        ...(command.env === undefined ? {} : { env: command.env }),
      }),
      stream: "stdout" as const,
    };
    const redaction = command.extraSecrets
      ? { extraSecrets: command.extraSecrets }
      : {};
    collector.append(headerEntry, redaction);
    commandCollector.append(headerEntry, redaction);

    const runningCommand = await sandbox.runCommand({
      args: command.args ? [...command.args] : [],
      cmd: command.cmd,
      ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
      detached: true,
      ...(command.env === undefined ? {} : { env: { ...command.env } }),
    });

    const logsHandle = runningCommand.logs();
    try {
      for await (const entry of logsHandle) {
        const redacted = collector.append(entry, redaction);
        commandCollector.append(entry, redaction);
        await command.onLog?.({ data: redacted, stream: entry.stream });
      }
    } finally {
      try {
        logsHandle.close();
      } catch {
        // The command may have already closed its log stream.
      }
    }

    const finished = await runningCommand.wait();
    return {
      exitCode: finished.exitCode,
      transcript: commandCollector.snapshot(),
    };
  };
}

function createSandboxJobSession(
  input: SessionInput,
  deps: RunnerDeps,
): SandboxJobSession {
  const collector = new SandboxTranscriptCollector();
  let lastJob = input.job;
  let finalization: Promise<{
    job: SandboxJobDto;
    transcript: SandboxTranscript;
  }> | null = null;

  const stopAndConfirm = async () => {
    await deps.stopOwnedSandbox({
      runId: input.runId,
      sandbox: input.sandbox,
      sandboxId: input.sandbox.sandboxId,
    });
  };

  const finishCancellation = async () => {
    await deps.cancelProvisionedJob({
      jobId: input.job.id,
      runId: input.runId,
      sandbox: input.sandbox,
    });
    lastJob = await deps.updateJob(input.job.id, {
      endedAt: deps.now(),
      status: "canceled",
    });
  };

  const finalizeOnce = async (
    result: Readonly<{ status: string; exitCode: number }>,
  ) => {
    const transcript = collector.snapshot();
    let transcriptBlobRef: string | null = null;
    try {
      transcriptBlobRef = await deps.putTranscriptBlob({
        blobPath: getSandboxTranscriptBlobPath({
          jobId: input.job.id,
          projectId: input.projectId,
          runId: input.runId,
        }),
        content: transcript.combined,
      });
    } catch {
      // Transcript upload is observability-only; job state remains canonical.
    }

    if (input.stopOnFinalize) await stopAndConfirm();

    lastJob = await deps.updateJob(input.job.id, {
      endedAt: deps.now(),
      exitCode: result.exitCode,
      ...(transcriptBlobRef ? { transcriptBlobRef } : {}),
      status: result.status,
    });

    if (lastJob.status === "canceling" || lastJob.status === "canceled") {
      await deps.cancelProvisionedJob({
        jobId: input.job.id,
        runId: input.runId,
        sandbox: input.sandbox,
      });
      throw new AppError(
        "sandbox_job_canceled",
        409,
        "Sandbox job was canceled before finalization completed.",
      );
    }

    return { job: lastJob, transcript };
  };

  return {
    cancel: async () => {
      if (!finalization) {
        finalization = (async () => {
          if (input.stopOnFinalize) {
            await finishCancellation();
          } else {
            lastJob = await deps.updateJob(input.job.id, {
              endedAt: deps.now(),
              status: "canceled",
            });
            if (lastJob.status === "canceling") await finishCancellation();
          }
          return { job: lastJob, transcript: collector.snapshot() };
        })();
      }
      await finalization;
    },
    finalize: async (result) => {
      finalization ??= finalizeOnce(result);
      return await finalization;
    },
    job: input.job,
    runCommand: createRunCommand(input.sandbox, collector),
    sandbox: input.sandbox,
    snapshotTranscript: () => collector.snapshot(),
    stop: stopAndConfirm,
    transcriptCollector: collector,
  };
}

async function cleanupAfterActivationFailure(
  input: Readonly<{
    activationError: unknown;
    job: SandboxJobDto;
    runId: string;
    sandbox: Sandbox;
  }>,
  deps: RunnerDeps,
): Promise<never> {
  try {
    await deps.cancelProvisionedJob({
      jobId: input.job.id,
      runId: input.runId,
      sandbox: input.sandbox,
    });
  } catch (cleanupError) {
    throw new AppError(
      "sandbox_activation_cleanup_failed",
      502,
      "Sandbox activation and durable cleanup both failed.",
      new AggregateError(
        [input.activationError, cleanupError],
        "Sandbox activation cleanup failed.",
      ),
    );
  }

  try {
    await deps.updateJob(input.job.id, {
      endedAt: deps.now(),
      status: "failed",
    });
  } catch (updateError) {
    throw new AppError(
      "sandbox_activation_persistence_failed",
      500,
      "Sandbox cleanup succeeded but job failure persistence failed.",
      new AggregateError(
        [input.activationError, updateError],
        "Sandbox activation persistence failed.",
      ),
    );
  }
  throw input.activationError;
}

async function assertRunningJob(
  input: Readonly<{
    job: SandboxJobDto;
    runId: string;
    sandbox: Sandbox;
  }>,
  deps: RunnerDeps,
): Promise<SandboxJobDto> {
  if (input.job.status === "running") return input.job;
  if (input.job.status === "pending") {
    try {
      const activated = await deps.activateJob(input.job.id, {
        sandboxId: input.sandbox.sandboxId,
        startedAt: deps.now(),
      });
      if (activated.status === "running") return activated;
      if (activated.status === "canceling" || activated.status === "canceled") {
        await deps.cancelProvisionedJob({
          jobId: input.job.id,
          runId: input.runId,
          sandbox: input.sandbox,
        });
        throw new AppError(
          "sandbox_job_canceled",
          409,
          "Sandbox job was canceled before startup completed.",
        );
      }
      throw new AppError(
        "sandbox_job_terminal",
        409,
        "Sandbox job finalized before startup completed.",
      );
    } catch (activationError) {
      if (
        activationError instanceof AppError &&
        activationError.code === "sandbox_job_canceled"
      ) {
        throw activationError;
      }
      return await cleanupAfterActivationFailure(
        {
          activationError,
          job: input.job,
          runId: input.runId,
          sandbox: input.sandbox,
        },
        deps,
      );
    }
  }
  throw new AppError(
    "sandbox_job_terminal",
    409,
    "Sandbox job is already terminal.",
  );
}

/**
 * Start or recover a stable sandbox provisioning session.
 *
 * @remarks
 * `provisioningKey` must be stable across Workflow retries. A retry either
 * reuses the published sandbox, waits for an unknown provider response's TTL
 * window, or reclaims the same job only after that window expires.
 *
 * @param input - Job identity and sandbox creation options.
 * @param deps - Dependency injection for tests.
 * @returns Session object.
 */
export async function startSandboxJobSession(
  input: Readonly<{
    projectId: string;
    provisioningKey: string;
    runId: string;
    jobType: string;
    stepId?: string | null;
    metadata?: Record<string, unknown>;
    networkPolicy: NetworkPolicy;
    runtime?: "node24" | "node22" | "python3.13";
    vcpus?: number;
    timeoutMs: number;
    ports?: number[];
    source?: SandboxGitSource;
    signal?: AbortSignal;
    /** Stop and durably confirm the sandbox before final job persistence. */
    stopOnFinalize?: boolean;
  }>,
  deps: Partial<RunnerDeps> = {},
): Promise<SandboxJobSession> {
  const resolved: RunnerDeps = { ...defaultDeps, ...deps };
  const claim = await resolved.claimProvisioning({
    createTimeoutMs: resolved.createTimeoutMs,
    jobType: input.jobType,
    metadata: input.metadata ?? {},
    projectId: input.projectId,
    provisioningKey: input.provisioningKey,
    runId: input.runId,
    ...(input.stepId === undefined ? {} : { stepId: input.stepId }),
    timeoutMs: input.timeoutMs,
  });

  if (claim.state === "pending") {
    const retryAfter = claim.job.provisioningExpiresAt;
    if (!retryAfter) {
      throw new AppError(
        "sandbox_provisioning_window_missing",
        500,
        "Pending sandbox provisioning has no durable expiry.",
      );
    }
    throw new RetryableError(
      "A prior sandbox provisioning attempt may still own a live resource.",
      { retryAfter: new Date(retryAfter) },
    );
  }
  if (claim.state === "terminal") {
    throw new AppError(
      "sandbox_job_terminal",
      409,
      "The stable sandbox provisioning job is already terminal.",
    );
  }

  let sandbox: Sandbox;
  if (claim.state === "reuse") {
    if (!claim.job.sandboxId) {
      throw new AppError(
        "sandbox_ownership_missing",
        500,
        "Reusable sandbox job has no sandbox identity.",
      );
    }
    sandbox = await resolved.getSandbox(claim.job.sandboxId, {
      signal: createOperationSignal(resolved.createTimeoutMs, input.signal),
    });
  } else {
    sandbox = await resolved.createSandbox({
      networkPolicy: input.networkPolicy,
      ...(input.ports === undefined ? {} : { ports: input.ports }),
      runtime: input.runtime ?? "node24",
      signal: createOperationSignal(resolved.createTimeoutMs, input.signal),
      ...(input.source === undefined ? {} : { source: input.source }),
      timeoutMs: input.timeoutMs,
      vcpus: input.vcpus ?? 2,
    });
  }

  const runningJob = await assertRunningJob(
    { job: claim.job, runId: input.runId, sandbox },
    resolved,
  );
  return createSandboxJobSession(
    {
      job: runningJob,
      projectId: input.projectId,
      runId: input.runId,
      sandbox,
      stopOnFinalize: input.stopOnFinalize ?? true,
    },
    resolved,
  );
}

/**
 * Attach a transcript job to an existing run-owned sandbox.
 *
 * @param input - Existing sandbox identity and job metadata.
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
    metadata?: Record<string, unknown>;
    /** Stop and durably confirm the sandbox before final job persistence. */
    stopOnFinalize?: boolean;
  }>,
  deps: Partial<RunnerDeps> = {},
): Promise<SandboxJobSession> {
  const resolved: RunnerDeps = { ...defaultDeps, ...deps };
  const job = await resolved.createJob({
    jobType: input.jobType,
    metadata: input.metadata ?? {},
    projectId: input.projectId,
    runId: input.runId,
    sandboxId: input.sandboxId,
    status: "pending",
    ...(input.stepId === undefined ? {} : { stepId: input.stepId }),
  });
  const sandbox = await resolved.getSandbox(input.sandboxId, {
    signal: createOperationSignal(resolved.createTimeoutMs),
  });
  const runningJob = await assertRunningJob(
    { job, runId: input.runId, sandbox },
    resolved,
  );
  return createSandboxJobSession(
    {
      job: runningJob,
      projectId: input.projectId,
      runId: input.runId,
      sandbox,
      stopOnFinalize: input.stopOnFinalize ?? false,
    },
    resolved,
  );
}
