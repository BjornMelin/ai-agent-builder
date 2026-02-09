import type { UIMessageChunk } from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";
import { AppError } from "@/lib/core/errors";
import type { RunStreamEvent } from "@/lib/runs/run-stream";
import { approvalHook } from "@/workflows/approvals/hooks/approval";
import { ensureApprovalRequest } from "@/workflows/runs/steps/approvals.step";
import { createRunSummaryArtifact } from "@/workflows/runs/steps/artifacts.step";
import { deployImplementationToProductionStep } from "@/workflows/runs/steps/deploy-production.step";
import {
  applyImplementationPatch,
  ensureImplementationRepoContext,
  openImplementationPullRequest,
  planImplementationRun,
  preflightImplementationRun,
  sandboxCheckoutImplementationRepo,
  stopImplementationSandbox,
  verifyImplementationRun,
} from "@/workflows/runs/steps/implementation.step";
import {
  beginRunStep,
  cancelRunAndSteps,
  ensureRunStepRow,
  finishRunStep,
  getRunInfo,
  markRunRunning,
  markRunStepStatus,
  markRunTerminal,
  markRunWaiting,
} from "@/workflows/runs/steps/persist.step";
import { provisionImplementationInfraStep } from "@/workflows/runs/steps/provision.step";
import {
  mergeGitHubPullRequestStep,
  pollGitHubChecksUntilTerminalStep,
} from "@/workflows/runs/steps/repo.step";
import {
  closeRunStream,
  writeRunEvent,
} from "@/workflows/runs/steps/writer.step";
import { isWorkflowRunCancelledError } from "@/workflows/runs/workflow-errors";

function nowTimestamp(): number {
  return Date.now();
}

function toStepErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message || "Failed." };
  }

  if (typeof error === "string" && error.length > 0) {
    return { message: error };
  }

  return { message: "Failed." };
}

/**
 * Durable run workflow (Workflow DevKit).
 *
 * @remarks
 * This is the canonical orchestrator for durable runs. It writes structured
 * events to the workflow stream for UI consumption, and persists run/step state
 * to Neon via Drizzle.
 *
 * @param runId - Durable run ID stored in Neon.
 * @returns Ok result.
 * @throws Error - Rethrows runtime/persistence errors encountered during
 * orchestration (including cancellation/runtime failures).
 */
export async function projectRun(
  runId: string,
): Promise<Readonly<{ ok: true }>> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();
  let activeStepId: string | null = null;

  try {
    const runInfo = await getRunInfo(runId);

    const startedEvent: RunStreamEvent = {
      kind: runInfo.kind,
      runId,
      timestamp: nowTimestamp(),
      type: "run-started",
      workflowRunId,
    };

    await writeRunEvent(writable, startedEvent);
    await markRunRunning(runId);

    type RunStepKind =
      | "llm"
      | "tool"
      | "sandbox"
      | "wait"
      | "approval"
      | "external_poll";

    type StepMeta = Readonly<{
      stepId: string;
      stepKind: RunStepKind;
      stepName: string;
      inputs?: Record<string, unknown>;
    }>;

    async function runPersistedStep<T>(
      meta: StepMeta,
      fn: () => Promise<T>,
      toOutputs: (value: T) => Record<string, unknown> = (value) =>
        typeof value === "object" && value !== null
          ? (value as unknown as Record<string, unknown>)
          : { value },
    ): Promise<T> {
      await ensureRunStepRow({
        runId,
        stepId: meta.stepId,
        stepKind: meta.stepKind,
        stepName: meta.stepName,
        ...(meta.inputs === undefined ? {} : { inputs: meta.inputs }),
      });
      await beginRunStep({ runId, stepId: meta.stepId });
      await writeRunEvent(writable, {
        runId,
        stepId: meta.stepId,
        stepKind: meta.stepKind,
        stepName: meta.stepName,
        timestamp: nowTimestamp(),
        type: "step-started",
      });
      activeStepId = meta.stepId;

      const result = await fn();
      const outputs = toOutputs(result);

      await finishRunStep({
        outputs,
        runId,
        status: "succeeded",
        stepId: meta.stepId,
      });
      await writeRunEvent(writable, {
        outputs,
        runId,
        status: "succeeded",
        stepId: meta.stepId,
        timestamp: nowTimestamp(),
        type: "step-finished",
      });
      activeStepId = null;
      return result;
    }

    async function awaitApprovalGate(
      meta: Readonly<{
        stepId: string;
        scope: string;
        stepName: string;
        intentSummary: string;
        metadata?: Record<string, unknown>;
      }>,
    ) {
      await ensureRunStepRow({
        inputs: { scope: meta.scope },
        runId,
        stepId: meta.stepId,
        stepKind: "approval",
        stepName: meta.stepName,
      });
      await beginRunStep({ runId, stepId: meta.stepId });
      await writeRunEvent(writable, {
        runId,
        stepId: meta.stepId,
        stepKind: "approval",
        stepName: meta.stepName,
        timestamp: nowTimestamp(),
        type: "step-started",
      });
      activeStepId = meta.stepId;

      const approval = await ensureApprovalRequest({
        intentSummary: meta.intentSummary,
        ...(meta.metadata === undefined ? {} : { metadata: meta.metadata }),
        projectId: runInfo.projectId,
        runId,
        scope: meta.scope,
      });

      await markRunWaiting(runId);
      const waitingOutputs = {
        approvalId: approval.approvalId,
        scope: approval.scope,
      };
      await markRunStepStatus({
        outputs: waitingOutputs,
        runId,
        status: "waiting",
        stepId: meta.stepId,
      });
      await writeRunEvent(writable, {
        outputs: waitingOutputs,
        runId,
        status: "waiting",
        stepId: meta.stepId,
        timestamp: nowTimestamp(),
        type: "step-finished",
      });

      const hook = approvalHook.create({ token: approval.approvalId });
      const payload = await hook;

      const approvedOutputs = {
        approvalId: payload.approvalId,
        approvedAt: payload.approvedAt,
        approvedBy: payload.approvedBy,
        ...(payload.scope === undefined ? {} : { scope: payload.scope }),
      };
      await finishRunStep({
        outputs: approvedOutputs,
        runId,
        status: "succeeded",
        stepId: meta.stepId,
      });
      await writeRunEvent(writable, {
        outputs: approvedOutputs,
        runId,
        status: "succeeded",
        stepId: meta.stepId,
        timestamp: nowTimestamp(),
        type: "step-finished",
      });
      activeStepId = null;
      return payload;
    }

    await ensureRunStepRow({
      runId,
      stepId: "run.start",
      stepKind: "tool",
      stepName: "Start run",
    });
    await beginRunStep({ runId, stepId: "run.start" });
    await writeRunEvent(writable, {
      runId,
      stepId: "run.start",
      stepKind: "tool",
      stepName: "Start run",
      timestamp: nowTimestamp(),
      type: "step-started",
    });
    activeStepId = "run.start";
    await finishRunStep({
      outputs: { ok: true },
      runId,
      status: "succeeded",
      stepId: "run.start",
    });
    await writeRunEvent(writable, {
      outputs: { ok: true },
      runId,
      status: "succeeded",
      stepId: "run.start",
      timestamp: nowTimestamp(),
      type: "step-finished",
    });
    activeStepId = null;

    if (runInfo.kind === "implementation") {
      await runPersistedStep(
        {
          stepId: "impl.preflight",
          stepKind: "tool",
          stepName: "Preflight",
        },
        async () => await preflightImplementationRun(),
      );

      const repo = await runPersistedStep(
        {
          stepId: "impl.repo.ensure",
          stepKind: "tool",
          stepName: "Ensure repo connection",
        },
        async () =>
          await ensureImplementationRepoContext({
            projectId: runInfo.projectId,
            runId,
          }),
        (value) => ({
          branchName: value.branchName,
          cloneUrl: value.cloneUrl,
          defaultBranch: value.defaultBranch,
          htmlUrl: value.htmlUrl,
          name: value.name,
          owner: value.owner,
          projectSlug: value.projectSlug,
          repoId: value.repoId,
        }),
      );

      const checkout = await runPersistedStep(
        {
          inputs: { branchName: repo.branchName },
          stepId: "impl.sandbox.checkout",
          stepKind: "sandbox",
          stepName: "Sandbox checkout",
        },
        async () =>
          await sandboxCheckoutImplementationRepo({
            branchName: repo.branchName,
            cloneUrl: repo.cloneUrl,
            defaultBranch: repo.defaultBranch,
            projectId: runInfo.projectId,
            runId,
          }),
        (value) => ({
          baseBranch: value.baseBranch,
          branchName: value.branchName,
          repoPath: value.repoPath,
          sandboxId: value.sandboxId,
          sandboxJobId: value.sandboxJobId,
          transcriptBlobRef: value.transcriptBlobRef,
          transcriptTruncated: value.transcriptTruncated,
        }),
      );

      const plan = await runPersistedStep(
        {
          inputs: {
            branchName: repo.branchName,
            repo: `${repo.owner}/${repo.name}`,
          },
          stepId: "impl.plan",
          stepKind: "llm",
          stepName: "Generate plan",
        },
        async () =>
          await planImplementationRun({
            projectName: repo.projectName,
            projectSlug: repo.projectSlug,
            repoName: repo.name,
            repoOwner: repo.owner,
            runId,
          }),
        (value) => ({
          commitMessage: value.commitMessage,
          prTitle: value.prTitle,
        }),
      );

      const patch = await runPersistedStep(
        {
          inputs: {
            branchName: checkout.branchName,
            sandboxId: checkout.sandboxId,
          },
          stepId: "impl.patch",
          stepKind: "sandbox",
          stepName: "Apply patch + commit",
        },
        async () =>
          await applyImplementationPatch({
            branchName: checkout.branchName,
            commitMessage: plan.commitMessage,
            planMarkdown: plan.planMarkdown,
            projectId: runInfo.projectId,
            repoPath: checkout.repoPath,
            runId,
            sandboxId: checkout.sandboxId,
          }),
      );

      await runPersistedStep(
        {
          inputs: { sandboxId: checkout.sandboxId },
          stepId: "impl.verify",
          stepKind: "sandbox",
          stepName: "Verify (lint/typecheck/test/build)",
        },
        async () =>
          await verifyImplementationRun({
            projectId: runInfo.projectId,
            repoPath: checkout.repoPath,
            runId,
            sandboxId: checkout.sandboxId,
          }),
      );

      const pr = await runPersistedStep(
        {
          inputs: {
            base: repo.defaultBranch,
            branchName: checkout.branchName,
            commitSha: patch.commitSha,
          },
          stepId: "impl.pr.open",
          stepKind: "tool",
          stepName: "Open pull request",
        },
        async () =>
          await openImplementationPullRequest({
            base: repo.defaultBranch,
            body: plan.prBody,
            head: checkout.branchName,
            owner: repo.owner,
            repo: repo.name,
            title: plan.prTitle,
          }),
      );

      await runPersistedStep(
        {
          inputs: { sandboxId: checkout.sandboxId },
          stepId: "impl.sandbox.stop",
          stepKind: "sandbox",
          stepName: "Stop sandbox",
        },
        async () => {
          await stopImplementationSandbox(checkout.sandboxId);
          return { ok: true };
        },
      );

      await awaitApprovalGate({
        intentSummary: `Merge PR #${pr.prNumber} for ${repo.owner}/${repo.name}.`,
        metadata: { prNumber: pr.prNumber, prUrl: pr.prUrl },
        scope: "repo.merge",
        stepId: "approval.merge",
        stepName: "Await merge approval",
      });

      await markRunRunning(runId);

      const checks = await runPersistedStep(
        {
          inputs: { ref: patch.commitSha },
          stepId: "repo.checks",
          stepKind: "external_poll",
          stepName: "Poll GitHub checks",
        },
        async () =>
          await pollGitHubChecksUntilTerminalStep({
            owner: repo.owner,
            ref: patch.commitSha,
            repo: repo.name,
            timeoutMs: 10 * 60_000,
          }),
        (value) => ({
          kind: value.kind,
          last: value.last,
          pollCount: value.pollCount,
          waitedMs: value.waitedMs,
        }),
      );

      if (checks.kind !== "terminal" || checks.last.state !== "success") {
        throw new AppError(
          "conflict",
          409,
          `GitHub checks are not successful (state: ${checks.last.state}).`,
          checks,
        );
      }

      const merge = await runPersistedStep(
        {
          inputs: { prNumber: pr.prNumber },
          stepId: "repo.merge",
          stepKind: "tool",
          stepName: "Merge pull request",
        },
        async () =>
          await mergeGitHubPullRequestStep({
            expectedHeadSha: patch.commitSha,
            owner: repo.owner,
            pullNumber: pr.prNumber,
            repo: repo.name,
          }),
        (value) => ({
          merged: value.merged,
          message: value.message,
          sha: value.sha,
        }),
      );

      await awaitApprovalGate({
        intentSummary:
          "Provision or connect infrastructure for the target app.",
        metadata: { prNumber: pr.prNumber, prUrl: pr.prUrl },
        scope: "infra.provision",
        stepId: "approval.provision",
        stepName: "Await provision approval",
      });

      await markRunRunning(runId);

      await runPersistedStep(
        {
          inputs: { projectSlug: repo.projectSlug },
          stepId: "infra.provision",
          stepKind: "tool",
          stepName: "Provision infrastructure",
        },
        async () =>
          await provisionImplementationInfraStep({
            projectId: runInfo.projectId,
            projectSlug: repo.projectSlug,
            runId,
          }),
      );

      await awaitApprovalGate({
        intentSummary: "Deploy the target app to production.",
        metadata: { prNumber: pr.prNumber, prUrl: pr.prUrl },
        scope: "deploy.production",
        stepId: "approval.deploy_prod",
        stepName: "Await production deploy approval",
      });

      await markRunRunning(runId);

      await runPersistedStep(
        {
          inputs: {
            ref: repo.defaultBranch,
            sha: merge.sha,
          },
          stepId: "deploy.production",
          stepKind: "tool",
          stepName: "Deploy to production",
        },
        async () =>
          await deployImplementationToProductionStep({
            projectId: runInfo.projectId,
            projectSlug: repo.projectSlug,
            ref: repo.defaultBranch,
            repoName: repo.name,
            repoOwner: repo.owner,
            runId,
            sha: merge.sha,
          }),
      );
    }

    await ensureRunStepRow({
      runId,
      stepId: "run.complete",
      stepKind: "tool",
      stepName: "Complete run",
    });
    await beginRunStep({ runId, stepId: "run.complete" });
    await writeRunEvent(writable, {
      runId,
      stepId: "run.complete",
      stepKind: "tool",
      stepName: "Complete run",
      timestamp: nowTimestamp(),
      type: "step-started",
    });
    activeStepId = "run.complete";
    await finishRunStep({
      outputs: { ok: true },
      runId,
      status: "succeeded",
      stepId: "run.complete",
    });
    await writeRunEvent(writable, {
      outputs: { ok: true },
      runId,
      status: "succeeded",
      stepId: "run.complete",
      timestamp: nowTimestamp(),
      type: "step-finished",
    });
    activeStepId = null;

    await ensureRunStepRow({
      runId,
      stepId: "artifact.run_summary",
      stepKind: "tool",
      stepName: "Persist run summary artifact",
    });
    await beginRunStep({ runId, stepId: "artifact.run_summary" });
    await writeRunEvent(writable, {
      runId,
      stepId: "artifact.run_summary",
      stepKind: "tool",
      stepName: "Persist run summary artifact",
      timestamp: nowTimestamp(),
      type: "step-started",
    });
    activeStepId = "artifact.run_summary";
    const summary = await createRunSummaryArtifact({
      kind: runInfo.kind,
      projectId: runInfo.projectId,
      runId,
      status: "succeeded",
      workflowRunId,
    });
    await finishRunStep({
      outputs: summary,
      runId,
      status: "succeeded",
      stepId: "artifact.run_summary",
    });
    await writeRunEvent(writable, {
      outputs: summary,
      runId,
      status: "succeeded",
      stepId: "artifact.run_summary",
      timestamp: nowTimestamp(),
      type: "step-finished",
    });
    activeStepId = null;

    await markRunTerminal(runId, "succeeded");
    await writeRunEvent(writable, {
      runId,
      status: "succeeded",
      timestamp: nowTimestamp(),
      type: "run-finished",
    });

    return { ok: true };
  } catch (error) {
    const cancelled = isWorkflowRunCancelledError(error);
    try {
      if (cancelled) {
        if (activeStepId !== null) {
          await finishRunStep({
            runId,
            status: "canceled",
            stepId: activeStepId,
          });
          await writeRunEvent(writable, {
            runId,
            status: "canceled",
            stepId: activeStepId,
            timestamp: nowTimestamp(),
            type: "step-finished",
          });
        }
        await cancelRunAndSteps(runId);
        await writeRunEvent(writable, {
          runId,
          status: "canceled",
          timestamp: nowTimestamp(),
          type: "run-finished",
        });
      } else {
        if (activeStepId !== null) {
          try {
            const stepError = toStepErrorPayload(error);
            await finishRunStep({
              error: stepError,
              runId,
              status: "failed",
              stepId: activeStepId,
            });
            await writeRunEvent(writable, {
              error: stepError,
              runId,
              status: "failed",
              stepId: activeStepId,
              timestamp: nowTimestamp(),
              type: "step-finished",
            });
          } catch {
            // Best effort only; still attempt to mark the run as failed.
          }
        }

        await markRunTerminal(runId, "failed");
        await writeRunEvent(writable, {
          runId,
          status: "failed",
          timestamp: nowTimestamp(),
          type: "run-finished",
        });
      }
    } catch {
      // Best effort only; preserve original error.
    }
    throw error;
  } finally {
    try {
      await closeRunStream(writable);
    } catch {
      // Best effort only.
    }
  }
}
