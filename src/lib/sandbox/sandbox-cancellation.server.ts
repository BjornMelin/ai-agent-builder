import "server-only";

import { APIError, type Sandbox } from "@vercel/sandbox";

import { AppError } from "@/lib/core/errors";
import type { SandboxJobDto } from "@/lib/data/sandbox-jobs.server";
import {
  claimSandboxJobsForCancellation,
  claimSandboxStopForRun,
  completeSandboxJobCancellation,
  confirmSandboxStoppedForRun,
  getSandboxOwnerRunId,
  publishSandboxJobOwnership,
  recordSandboxStoppedForJob,
  releaseSandboxStopForRun,
} from "@/lib/data/sandbox-jobs.server";
import { getVercelSandbox } from "@/lib/sandbox/sandbox-client.server";

const DEFAULT_STOP_TIMEOUT_MS = 20_000;
const DEFAULT_STOP_CLAIM_LEASE_MS = 30_000;
const TERMINAL_SANDBOX_STATUSES = new Set(["aborted", "failed", "stopped"]);

class SandboxStopBusyError extends Error {}

type SandboxCancellationDeps = Readonly<{
  claimJobs: typeof claimSandboxJobsForCancellation;
  claimStop: typeof claimSandboxStopForRun;
  completeJobs: typeof completeSandboxJobCancellation;
  confirmStopped: typeof confirmSandboxStoppedForRun;
  createDeadline: (timeoutMs: number) => AbortSignal;
  getOwnerRunId: typeof getSandboxOwnerRunId;
  getSandbox: typeof getVercelSandbox;
  now: () => Date;
  publishOwnership: typeof publishSandboxJobOwnership;
  recordStopped: typeof recordSandboxStoppedForJob;
  releaseStop: typeof releaseSandboxStopForRun;
  stopClaimLeaseMs: number;
  stopTimeoutMs: number;
}>;

const defaultDeps: SandboxCancellationDeps = {
  claimJobs: claimSandboxJobsForCancellation,
  claimStop: claimSandboxStopForRun,
  completeJobs: completeSandboxJobCancellation,
  confirmStopped: confirmSandboxStoppedForRun,
  createDeadline: (timeoutMs) => AbortSignal.timeout(timeoutMs),
  getOwnerRunId: getSandboxOwnerRunId,
  getSandbox: getVercelSandbox,
  now: () => new Date(),
  publishOwnership: publishSandboxJobOwnership,
  recordStopped: recordSandboxStoppedForJob,
  releaseStop: releaseSandboxStopForRun,
  stopClaimLeaseMs: DEFAULT_STOP_CLAIM_LEASE_MS,
  stopTimeoutMs: DEFAULT_STOP_TIMEOUT_MS,
};

function isTerminalSandboxStatus(status: unknown): boolean {
  return typeof status === "string" && TERMINAL_SANDBOX_STATUSES.has(status);
}

function isSandboxNotFound(error: unknown): boolean {
  return error instanceof APIError && error.response.status === 404;
}

function timeoutError(timeoutMs: number): AppError {
  return new AppError(
    "sandbox_stop_timeout",
    504,
    `Sandbox shutdown was not confirmed within ${timeoutMs}ms.`,
  );
}

async function awaitWithDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  if (signal.aborted) throw timeoutError(timeoutMs);

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(timeoutError(timeoutMs));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function getSandboxIfPresent(
  sandboxId: string,
  getSandbox: typeof getVercelSandbox,
  signal: AbortSignal,
): Promise<Sandbox | null> {
  try {
    return await getSandbox(sandboxId, { signal });
  } catch (error) {
    if (isSandboxNotFound(error)) return null;
    throw error;
  }
}

async function stopSandboxAndConfirmState(
  sandbox: Sandbox,
  deps: SandboxCancellationDeps,
  signal: AbortSignal,
): Promise<void> {
  if (isTerminalSandboxStatus(sandbox.status)) return;

  let stopError: unknown = null;
  try {
    const stopped = await sandbox.stop({ blocking: true, signal });
    if (isTerminalSandboxStatus(stopped.status)) return;
    stopError = new AppError(
      "sandbox_stop_unconfirmed",
      502,
      "Sandbox stop returned without a terminal state.",
    );
  } catch (error) {
    stopError = error;
  }

  let current: Sandbox | null;
  try {
    current = await getSandboxIfPresent(
      sandbox.sandboxId,
      deps.getSandbox,
      signal,
    );
  } catch (confirmationError) {
    throw new AggregateError(
      [stopError, confirmationError],
      "Sandbox stop and confirmation both failed.",
    );
  }
  if (!current || isTerminalSandboxStatus(current.status)) return;
  throw stopError;
}

async function stopSandboxWithinDeadline(
  input: Readonly<{ sandbox?: Sandbox; sandboxId: string }>,
  deps: SandboxCancellationDeps,
  signal: AbortSignal,
): Promise<void> {
  const sandbox =
    input.sandbox ??
    (await getSandboxIfPresent(input.sandboxId, deps.getSandbox, signal));
  if (!sandbox) return;
  await stopSandboxAndConfirmState(sandbox, deps, signal);
}

async function releaseClaimAfterFailure(
  input: Readonly<{ claimedAt: Date; runId: string; sandboxId: string }>,
  deps: SandboxCancellationDeps,
): Promise<void> {
  try {
    await deps.releaseStop(input.runId, input.sandboxId, input.claimedAt);
  } catch {
    // The database-clock lease permits recovery if explicit release fails.
  }
}

/**
 * Stop and durably confirm one run-owned sandbox.
 *
 * @remarks
 * A single deadline covers lookup, blocking stop, provider confirmation, and
 * persistence of `sandbox_stopped_at`. Missing or already-terminal sandboxes
 * are successful idempotent outcomes. Concurrent callers are serialized by a
 * database-clock lease.
 *
 * @param input - Durable ownership and optional already-resolved sandbox.
 * @param deps - Dependency overrides for tests.
 */
export async function stopRunOwnedSandbox(
  input: Readonly<{ runId: string; sandboxId: string; sandbox?: Sandbox }>,
  deps: Partial<SandboxCancellationDeps> = {},
): Promise<void> {
  const resolved: SandboxCancellationDeps = { ...defaultDeps, ...deps };
  const claim = await resolved.claimStop(
    input.runId,
    input.sandboxId,
    resolved.stopClaimLeaseMs,
  );
  if (claim.state === "stopped") return;
  if (claim.state === "busy") {
    throw new SandboxStopBusyError(
      `Sandbox ${input.sandboxId} is being stopped by another request.`,
    );
  }

  const signal = resolved.createDeadline(resolved.stopTimeoutMs);
  try {
    await awaitWithDeadline(
      stopSandboxWithinDeadline(input, resolved, signal),
      signal,
      resolved.stopTimeoutMs,
    );
    await awaitWithDeadline(
      resolved.confirmStopped(input.runId, input.sandboxId, resolved.now()),
      signal,
      resolved.stopTimeoutMs,
    );
  } catch (error) {
    await releaseClaimAfterFailure(
      {
        claimedAt: claim.claimedAt,
        runId: input.runId,
        sandboxId: input.sandboxId,
      },
      resolved,
    );
    throw error;
  }
}

/**
 * Stop a sandbox after resolving its durable run ownership.
 *
 * @param sandboxId - Provider sandbox ID.
 * @param deps - Dependency overrides for tests.
 */
export async function stopOwnedSandboxById(
  sandboxId: string,
  deps: Partial<SandboxCancellationDeps> = {},
): Promise<void> {
  const resolved: SandboxCancellationDeps = { ...defaultDeps, ...deps };
  const runId = await resolved.getOwnerRunId(sandboxId);
  if (!runId) {
    throw new AppError(
      "sandbox_ownership_not_found",
      409,
      "Sandbox ownership was not published.",
    );
  }
  await stopRunOwnedSandbox({ runId, sandboxId }, resolved);
}

/**
 * Stop a sandbox returned by the provider while its activation write failed.
 *
 * @remarks
 * Ownership is published before normal leased cleanup. If publication is
 * unavailable, the known object is stopped directly under the same bounded
 * contract and then ownership plus stop confirmation are recorded atomically.
 * Cleanup or recovery-write failures are surfaced to the caller.
 *
 * @param input - Provisioned sandbox and its durable ownership identity.
 * @param deps - Dependency overrides for tests.
 */
export async function cancelProvisionedSandboxJob(
  input: Readonly<{ jobId: string; runId: string; sandbox: Sandbox }>,
  deps: Partial<SandboxCancellationDeps> = {},
): Promise<void> {
  const resolved: SandboxCancellationDeps = { ...defaultDeps, ...deps };
  try {
    await resolved.publishOwnership(input.jobId, input.sandbox.sandboxId);
  } catch (publicationError) {
    const signal = resolved.createDeadline(resolved.stopTimeoutMs);
    try {
      await awaitWithDeadline(
        stopSandboxWithinDeadline(
          { sandbox: input.sandbox, sandboxId: input.sandbox.sandboxId },
          resolved,
          signal,
        ),
        signal,
        resolved.stopTimeoutMs,
      );
      await awaitWithDeadline(
        resolved.recordStopped(
          input.jobId,
          input.sandbox.sandboxId,
          resolved.now(),
        ),
        signal,
        resolved.stopTimeoutMs,
      );
    } catch (cleanupError) {
      throw new AppError(
        "sandbox_cleanup_failed",
        502,
        "Failed to durably clean up a provisioned sandbox.",
        new AggregateError(
          [publicationError, cleanupError],
          "Sandbox ownership publication and direct cleanup failed.",
        ),
      );
    }
    await resolved.completeJobs([input.jobId], resolved.now());
    return;
  }

  await stopRunOwnedSandbox(
    {
      runId: input.runId,
      sandbox: input.sandbox,
      sandboxId: input.sandbox.sandboxId,
    },
    resolved,
  );
  await resolved.completeJobs([input.jobId], resolved.now());
}

function groupJobsBySandbox(
  jobs: readonly SandboxJobDto[],
): Map<string, SandboxJobDto[]> {
  const grouped = new Map<string, SandboxJobDto[]>();
  for (const job of jobs) {
    if (!job.sandboxId) continue;
    const group = grouped.get(job.sandboxId) ?? [];
    group.push(job);
    grouped.set(job.sandboxId, group);
  }
  return grouped;
}

async function stopSandboxGroups(
  runId: string,
  jobs: readonly SandboxJobDto[],
  resolved: SandboxCancellationDeps,
  confirmedSandboxIds: Set<string>,
  stopErrors: Map<string, unknown>,
): Promise<void> {
  const groups = [...groupJobsBySandbox(jobs).entries()].filter(
    ([sandboxId]) => !confirmedSandboxIds.has(sandboxId),
  );
  const results = await Promise.allSettled(
    groups.map(async ([sandboxId, sandboxJobs]) => {
      if (sandboxJobs.every((job) => job.sandboxStoppedAt !== null)) return;
      await stopRunOwnedSandbox({ runId, sandboxId }, resolved);
    }),
  );

  for (const [index, result] of results.entries()) {
    const sandboxId = groups[index]?.[0];
    if (!sandboxId) continue;
    if (result.status === "fulfilled") {
      confirmedSandboxIds.add(sandboxId);
      stopErrors.delete(sandboxId);
    } else {
      stopErrors.set(sandboxId, result.reason);
    }
  }
}

/**
 * Stop and terminalize every sandbox resource owned by a canceled run.
 *
 * @remarks
 * The run fence must be persisted first. Expired no-ID provisioning attempts
 * are completed by the DAL using the database clock; live attempts remain
 * retryable until the recorded provider TTL window proves no resource exists.
 *
 * @param runId - Durable run ID.
 * @param deps - Dependency overrides for tests.
 * @throws AppError - `sandbox_cancel_failed` for confirmed stop failures.
 * @throws AppError - `sandbox_cancel_pending` while another bounded operation
 * still owns provisioning or shutdown.
 */
export async function cancelRunSandboxes(
  runId: string,
  deps: Partial<SandboxCancellationDeps> = {},
): Promise<void> {
  const resolved: SandboxCancellationDeps = { ...defaultDeps, ...deps };
  const confirmedSandboxIds = new Set<string>();
  const stopErrors = new Map<string, unknown>();

  let jobs = await resolved.claimJobs(runId);
  if (jobs.length === 0) return;
  await stopSandboxGroups(
    runId,
    jobs,
    resolved,
    confirmedSandboxIds,
    stopErrors,
  );

  jobs = await resolved.claimJobs(runId);
  await stopSandboxGroups(
    runId,
    jobs,
    resolved,
    confirmedSandboxIds,
    stopErrors,
  );

  const failures = [...stopErrors.values()].filter(
    (error) => !(error instanceof SandboxStopBusyError),
  );
  if (failures.length > 0) {
    throw new AppError(
      "sandbox_cancel_failed",
      502,
      "Failed to stop an active sandbox. Retry cancellation.",
      new AggregateError(failures, "Sandbox shutdown failed."),
    );
  }

  if (
    stopErrors.size > 0 ||
    jobs.some((job) => job.status === "canceling" && !job.sandboxId)
  ) {
    throw new AppError(
      "sandbox_cancel_pending",
      409,
      "Sandbox provisioning or shutdown is still resolving.",
    );
  }
}
