import type { UIMessageChunk } from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";
import { AppError } from "@/lib/core/errors";
import type { RunStreamEvent } from "@/lib/runs/run-stream";
import {
  nowTimestamp,
  toStepErrorPayload,
} from "@/workflows/_shared/workflow-run-utils";
import { approvalHook } from "@/workflows/approvals/hooks/approval";
import { ensureApprovalRequest } from "@/workflows/runs/steps/approvals.step";
import {
  createImplementationAuditBundleArtifact,
  createRunSummaryArtifact,
} from "@/workflows/runs/steps/artifacts.step";
import { deployImplementationToProductionStep } from "@/workflows/runs/steps/deploy-production.step";
import { sandboxCheckoutImplementationRepo } from "@/workflows/runs/steps/implementation/checkout.step";
import { applyImplementationPatch } from "@/workflows/runs/steps/implementation/patch.step";
import { planImplementationRun } from "@/workflows/runs/steps/implementation/planning.step";
import { preflightImplementationRun } from "@/workflows/runs/steps/implementation/preflight.step";
import { openImplementationPullRequest } from "@/workflows/runs/steps/implementation/pull-request.step";
import { ensureImplementationRepoContext } from "@/workflows/runs/steps/implementation/repo-context.step";
import { stopImplementationSandbox } from "@/workflows/runs/steps/implementation/stop-sandbox.step";
import { verifyImplementationRun } from "@/workflows/runs/steps/implementation/verify.step";
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
import { indexImplementationRepoStep } from "@/workflows/runs/steps/repo-index.step";
import {
  closeRunStream,
  writeRunEvent,
} from "@/workflows/runs/steps/writer.step";
import { isWorkflowRunCancelledError } from "@/workflows/runs/workflow-errors";

/**
 * Durable run workflow (Workflow DevKit).
 *
 * @remarks
 * This is the canonical orchestrator for durable runs. It writes structured
 * events to the workflow stream for UI consumption, and persists run/step state
 * to Neon via Drizzle.
 *
 * Related to SPEC-0027.
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
  let activeSandboxId: string | null = null;

  async function bestEffort(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch {
      // Best effort only.
    }
  }

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

    async function beginPersistedStep(meta: StepMeta): Promise<void> {
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
    }

    async function runPersistedStep<T>(
      meta: StepMeta,
      fn: () => Promise<T>,
      toOutputs: (value: T) => Record<string, unknown> = (value) =>
        typeof value === "object" && value !== null
          ? (value as unknown as Record<string, unknown>)
          : { value },
    ): Promise<T> {
      await beginPersistedStep(meta);

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
      await beginPersistedStep({
        inputs: { scope: meta.scope },
        stepId: meta.stepId,
        stepKind: "approval",
        stepName: meta.stepName,
      });

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
      await markRunRunning(runId);
      return payload;
    }

    await runPersistedStep(
      {
        stepId: "run.start",
        stepKind: "tool",
        stepName: "Start run",
      },
      async () => ({ ok: true }),
    );

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
          repoKind: value.repoKind,
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
            repoKind: repo.repoKind,
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
      activeSandboxId = checkout.sandboxId;

      await runPersistedStep(
        {
          inputs: {
            repoId: repo.repoId,
            sandboxId: checkout.sandboxId,
          },
          stepId: "impl.repo.index",
          stepKind: "tool",
          stepName: "Index repo (bounded)",
        },
        async () =>
          await indexImplementationRepoStep({
            projectId: runInfo.projectId,
            repoId: repo.repoId,
            repoKind: repo.repoKind,
            repoPath: checkout.repoPath,
            runId,
            sandboxId: checkout.sandboxId,
          }),
        (value) => ({
          chunksIndexed: value.chunksIndexed,
          commitSha: value.commitSha,
          filesIndexed: value.filesIndexed,
          namespace: value.namespace,
          prefix: value.prefix,
          sandboxJobId: value.sandboxJobId,
          transcriptBlobRef: value.transcriptBlobRef,
          transcriptTruncated: value.transcriptTruncated,
        }),
      );

      const plan = await runPersistedStep(
        {
          inputs: {
            branchName: repo.branchName,
            projectId: runInfo.projectId,
            repo: `${repo.owner}/${repo.name}`,
          },
          stepId: "impl.plan",
          stepKind: "llm",
          stepName: "Generate plan",
        },
        async () =>
          await planImplementationRun({
            projectId: runInfo.projectId,
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
            repoKind: repo.repoKind,
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
          activeSandboxId = null;
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

    await runPersistedStep(
      {
        stepId: "run.complete",
        stepKind: "tool",
        stepName: "Complete run",
      },
      async () => ({ ok: true }),
    );

    await runPersistedStep(
      {
        stepId: "artifact.run_summary",
        stepKind: "tool",
        stepName: "Persist run summary artifact",
      },
      async () =>
        await createRunSummaryArtifact({
          kind: runInfo.kind,
          projectId: runInfo.projectId,
          runId,
          status: "succeeded",
          workflowRunId,
        }),
    );

    if (runInfo.kind === "implementation") {
      await runPersistedStep(
        {
          stepId: "artifact.audit_bundle",
          stepKind: "tool",
          stepName: "Persist implementation audit bundle",
        },
        async () =>
          await createImplementationAuditBundleArtifact({
            projectId: runInfo.projectId,
            runId,
          }),
      );
    }

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

    async function finishActiveStepTerminal(
      status: "failed" | "canceled",
    ): Promise<void> {
      if (activeStepId === null) return;

      if (status === "canceled") {
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
        return;
      }

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
    }

    if (activeSandboxId !== null) {
      const sandboxId = activeSandboxId;
      activeSandboxId = null;
      await bestEffort(async () => await stopImplementationSandbox(sandboxId));
    }

    if (cancelled) {
      await bestEffort(async () => await finishActiveStepTerminal("canceled"));
      await bestEffort(async () => await cancelRunAndSteps(runId));
      await bestEffort(async () => {
        await writeRunEvent(writable, {
          runId,
          status: "canceled",
          timestamp: nowTimestamp(),
          type: "run-finished",
        });
      });
      throw error;
    }

    await bestEffort(async () => await finishActiveStepTerminal("failed"));
    await bestEffort(async () => await markRunTerminal(runId, "failed"));
    await bestEffort(async () => {
      await writeRunEvent(writable, {
        runId,
        status: "failed",
        timestamp: nowTimestamp(),
        type: "run-finished",
      });
    });
    throw error;
  } finally {
    await bestEffort(async () => await closeRunStream(writable));
  }
}
