import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  workflowRunId: "wf_1",
  writable: {} as WritableStream<unknown>,
}));

const persistMocks = vi.hoisted(() => ({
  beginRunStep: vi.fn(),
  cancelRunAndSteps: vi.fn(),
  ensureRunStepRow: vi.fn(),
  finishRunStep: vi.fn(),
  getRunInfo: vi.fn(),
  markRunRunning: vi.fn(),
  markRunStepStatus: vi.fn(),
  markRunTerminal: vi.fn(),
  markRunWaiting: vi.fn(),
}));

const writerMocks = vi.hoisted(() => ({
  closeRunStream: vi.fn(),
  writeRunEvent: vi.fn(),
}));

const artifactsMocks = vi.hoisted(() => ({
  createRunSummaryArtifact: vi.fn(),
}));

const workflowErrorMocks = vi.hoisted(() => ({
  isWorkflowRunCancelledError: vi.fn(),
}));

const approvalsStepMocks = vi.hoisted(() => ({
  ensureApprovalRequest: vi.fn(),
}));

const implementationStepMocks = vi.hoisted(() => ({
  applyImplementationPatch: vi.fn(),
  ensureImplementationRepoContext: vi.fn(),
  openImplementationPullRequest: vi.fn(),
  planImplementationRun: vi.fn(),
  preflightImplementationRun: vi.fn(),
  sandboxCheckoutImplementationRepo: vi.fn(),
  stopImplementationSandbox: vi.fn(),
  verifyImplementationRun: vi.fn(),
}));

const approvalHookMocks = vi.hoisted(() => ({
  approvalHook: { create: vi.fn() },
}));

const repoStepMocks = vi.hoisted(() => ({
  mergeGitHubPullRequestStep: vi.fn(),
  pollGitHubChecksUntilTerminalStep: vi.fn(),
}));

const provisionStepMocks = vi.hoisted(() => ({
  provisionImplementationInfraStep: vi.fn(),
}));

const deployStepMocks = vi.hoisted(() => ({
  deployImplementationToProductionStep: vi.fn(),
}));

vi.mock("workflow", () => ({
  getWorkflowMetadata: () => ({ workflowRunId: state.workflowRunId }),
  getWritable: () => state.writable,
}));

vi.mock("@/workflows/runs/steps/persist.step", () => persistMocks);
vi.mock("@/workflows/runs/steps/writer.step", () => writerMocks);
vi.mock("@/workflows/runs/steps/artifacts.step", () => artifactsMocks);
vi.mock("@/workflows/runs/steps/approvals.step", () => approvalsStepMocks);
vi.mock("@/workflows/runs/steps/repo.step", () => repoStepMocks);
vi.mock("@/workflows/runs/steps/provision.step", () => provisionStepMocks);
vi.mock("@/workflows/runs/steps/deploy-production.step", () => deployStepMocks);
vi.mock(
  "@/workflows/runs/steps/implementation.step",
  () => implementationStepMocks,
);
vi.mock("@/workflows/approvals/hooks/approval", () => approvalHookMocks);
vi.mock("@/workflows/runs/workflow-errors", () => workflowErrorMocks);

import { projectRun } from "./project-run.workflow";

async function waitUntil(
  predicate: () => boolean,
  options: Readonly<{ attempts?: number; delayMs?: number }> = {},
): Promise<void> {
  const attempts = Math.max(options.attempts ?? 50, 1);
  const delayMs = Math.max(options.delayMs ?? 0, 0);

  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) return;
    // Let the workflow advance to its next await point.
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("Timed out waiting for predicate.");
}

describe("projectRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    persistMocks.beginRunStep.mockResolvedValue(undefined);
    persistMocks.cancelRunAndSteps.mockResolvedValue(undefined);
    persistMocks.ensureRunStepRow.mockResolvedValue(undefined);
    persistMocks.finishRunStep.mockResolvedValue(undefined);
    persistMocks.getRunInfo.mockResolvedValue({
      kind: "research",
      projectId: "project_1",
    });
    persistMocks.markRunStepStatus.mockResolvedValue(undefined);
    persistMocks.markRunWaiting.mockResolvedValue(undefined);
    persistMocks.markRunRunning.mockResolvedValue(undefined);
    persistMocks.markRunTerminal.mockResolvedValue(undefined);

    writerMocks.closeRunStream.mockResolvedValue(undefined);
    writerMocks.writeRunEvent.mockResolvedValue(undefined);

    artifactsMocks.createRunSummaryArtifact.mockResolvedValue({
      artifactId: "artifact_1",
    });

    workflowErrorMocks.isWorkflowRunCancelledError.mockReturnValue(false);

    approvalsStepMocks.ensureApprovalRequest.mockImplementation(
      async (input: unknown) => {
        const scope =
          input && typeof input === "object"
            ? String((input as { scope?: unknown }).scope ?? "")
            : "";
        return { approvalId: `approval_${scope}`, scope };
      },
    );

    repoStepMocks.pollGitHubChecksUntilTerminalStep.mockResolvedValue({
      kind: "terminal",
      last: { checkRuns: [], ref: "test", state: "success", statuses: [] },
      pollCount: 1,
      waitedMs: 0,
    });
    repoStepMocks.mergeGitHubPullRequestStep.mockResolvedValue({
      merged: true,
      message: "Merged",
      sha: "sha_test",
    });

    provisionStepMocks.provisionImplementationInfraStep.mockResolvedValue(
      {} as unknown as Record<string, unknown>,
    );
    deployStepMocks.deployImplementationToProductionStep.mockResolvedValue(
      {} as unknown as Record<string, unknown>,
    );

    implementationStepMocks.preflightImplementationRun.mockResolvedValue({
      aiGatewayBaseUrl: "https://ai-gateway.example",
      aiGatewayChatModel: "xai/grok",
      githubConfigured: true,
      ok: true,
      sandboxAuth: "oidc",
    });
    implementationStepMocks.ensureImplementationRepoContext.mockResolvedValue({
      branchName: "agent/proj/run_1",
      cloneUrl: "https://github.com/a/b.git",
      defaultBranch: "main",
      htmlUrl: "https://github.com/a/b",
      name: "b",
      owner: "a",
      projectId: "project_1",
      projectName: "Project",
      projectSlug: "proj",
      provider: "github",
      repoId: "repo_1",
    });
    implementationStepMocks.sandboxCheckoutImplementationRepo.mockResolvedValue(
      {
        baseBranch: "main",
        branchName: "agent/proj/run_1",
        repoPath: "/vercel/sandbox/repo",
        sandboxId: "sbx_1",
      },
    );
    implementationStepMocks.planImplementationRun.mockResolvedValue({
      commitMessage: "chore: plan",
      planMarkdown: "# Plan",
      prBody: "Body",
      prTitle: "Title",
    });
    implementationStepMocks.applyImplementationPatch.mockResolvedValue({
      addedFilePath: "implementation-run-run_1.md",
      branchName: "agent/proj/run_1",
      commitSha: "sha_1",
    });
    implementationStepMocks.verifyImplementationRun.mockResolvedValue({
      build: { exitCode: 0 },
      lint: { exitCode: 0 },
      ok: true,
      test: { exitCode: 0 },
      typecheck: { exitCode: 0 },
    });
    implementationStepMocks.openImplementationPullRequest.mockResolvedValue({
      base: "main",
      head: "agent/proj/run_1",
      prNumber: 123,
      prTitle: "Title",
      prUrl: "https://github.com/a/b/pull/123",
    });
    implementationStepMocks.stopImplementationSandbox.mockResolvedValue(
      undefined,
    );

    approvalHookMocks.approvalHook.create.mockReturnValue(
      Promise.resolve({
        approvalId: "approval_repo.merge",
        approvedAt: "2026-02-09T00:00:00Z",
        approvedBy: "user@example.com",
        scope: "repo.merge",
      }),
    );
  });

  it("marks the active step failed when a non-cancel error is thrown mid-step", async () => {
    const failure = new Error("artifact explode");
    artifactsMocks.createRunSummaryArtifact.mockRejectedValueOnce(failure);

    await expect(projectRun("run_1")).rejects.toThrow("artifact explode");

    expect(persistMocks.finishRunStep).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { message: "artifact explode" },
        runId: "run_1",
        status: "failed",
        stepId: "artifact.run_summary",
      }),
    );

    expect(writerMocks.writeRunEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({
        error: { message: "artifact explode" },
        runId: "run_1",
        status: "failed",
        stepId: "artifact.run_summary",
        type: "step-finished",
      }),
    );

    expect(persistMocks.markRunTerminal).toHaveBeenCalledWith(
      "run_1",
      "failed",
    );
    expect(persistMocks.cancelRunAndSteps).not.toHaveBeenCalled();
    expect(writerMocks.closeRunStream).toHaveBeenCalledWith(state.writable);
  });

  it("completes successfully and emits terminal success events", async () => {
    await expect(projectRun("run_1")).resolves.toEqual({ ok: true });

    expect(artifactsMocks.createRunSummaryArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "research",
        projectId: "project_1",
        runId: "run_1",
        status: "succeeded",
        workflowRunId: "wf_1",
      }),
    );

    expect(persistMocks.finishRunStep).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run_1",
        status: "succeeded",
        stepId: "artifact.run_summary",
      }),
    );
    expect(persistMocks.markRunTerminal).toHaveBeenCalledWith(
      "run_1",
      "succeeded",
    );
    expect(writerMocks.writeRunEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({
        runId: "run_1",
        status: "succeeded",
        stepId: "artifact.run_summary",
        type: "step-finished",
      }),
    );
    expect(writerMocks.writeRunEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({
        runId: "run_1",
        status: "succeeded",
        type: "run-finished",
      }),
    );
    expect(writerMocks.closeRunStream).toHaveBeenCalledWith(state.writable);
  });

  it("persists cancellation when a cancellation error occurs mid-step", async () => {
    const cancellationError = new Error("run cancelled");
    artifactsMocks.createRunSummaryArtifact.mockRejectedValueOnce(
      cancellationError,
    );
    workflowErrorMocks.isWorkflowRunCancelledError.mockReturnValueOnce(true);

    await expect(projectRun("run_1")).rejects.toBe(cancellationError);

    expect(persistMocks.finishRunStep).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run_1",
        status: "canceled",
        stepId: "artifact.run_summary",
      }),
    );
    expect(persistMocks.cancelRunAndSteps).toHaveBeenCalledWith("run_1");
    expect(persistMocks.markRunTerminal).not.toHaveBeenCalled();
    expect(writerMocks.writeRunEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({
        runId: "run_1",
        status: "canceled",
        type: "run-finished",
      }),
    );
    expect(writerMocks.closeRunStream).toHaveBeenCalledWith(state.writable);
  });

  it("cancels the run without finishing a step when cancellation occurs before any step starts", async () => {
    const cancellationError = new Error("cancelled early");
    persistMocks.getRunInfo.mockRejectedValueOnce(cancellationError);
    workflowErrorMocks.isWorkflowRunCancelledError.mockReturnValueOnce(true);

    await expect(projectRun("run_1")).rejects.toBe(cancellationError);

    expect(persistMocks.finishRunStep).not.toHaveBeenCalled();
    expect(persistMocks.cancelRunAndSteps).toHaveBeenCalledWith("run_1");
    expect(writerMocks.writeRunEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({ status: "canceled", type: "run-finished" }),
    );
  });

  it("marks the run failed when a non-cancel error occurs before any step starts", async () => {
    const failure = "boom";
    persistMocks.getRunInfo.mockRejectedValueOnce(failure);
    workflowErrorMocks.isWorkflowRunCancelledError.mockReturnValueOnce(false);

    await expect(projectRun("run_1")).rejects.toBe(failure);

    expect(persistMocks.finishRunStep).not.toHaveBeenCalled();
    expect(persistMocks.markRunTerminal).toHaveBeenCalledWith(
      "run_1",
      "failed",
    );
    expect(writerMocks.writeRunEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({
        runId: "run_1",
        status: "failed",
        type: "run-finished",
      }),
    );
  });

  it("still marks the run failed when persisting step failure is best-effort", async () => {
    const failure = new Error("artifact explode");
    artifactsMocks.createRunSummaryArtifact.mockRejectedValueOnce(failure);
    persistMocks.finishRunStep.mockImplementation(async (input: unknown) => {
      const status =
        input && typeof input === "object"
          ? (input as { status?: unknown }).status
          : undefined;
      const stepId =
        input && typeof input === "object"
          ? (input as { stepId?: unknown }).stepId
          : undefined;
      if (status === "failed" && stepId === "artifact.run_summary") {
        throw new Error("db down");
      }
    });

    await expect(projectRun("run_1")).rejects.toThrow("artifact explode");

    // Even if step persistence fails, the run is still marked terminal failed.
    expect(persistMocks.markRunTerminal).toHaveBeenCalledWith(
      "run_1",
      "failed",
    );
  });

  it("swallows closeRunStream errors in finally", async () => {
    writerMocks.closeRunStream.mockRejectedValueOnce(new Error("close failed"));

    await expect(projectRun("run_1")).resolves.toEqual({ ok: true });
  });

  it("marks approval steps waiting and awaits the approval hook", async () => {
    persistMocks.getRunInfo.mockResolvedValueOnce({
      kind: "implementation",
      projectId: "project_1",
    });

    type ApprovalPayload = Readonly<{
      approvalId: string;
      approvedAt: string | null;
      approvedBy: string;
      scope: string;
    }>;

    let resolveApproval!: (value: ApprovalPayload) => void;
    const pendingApproval = new Promise<ApprovalPayload>((res) => {
      resolveApproval = res;
    });
    approvalHookMocks.approvalHook.create.mockReturnValueOnce(pendingApproval);

    const runPromise = projectRun("run_1");

    // Wait for the workflow to request approval and mark the step waiting.
    await waitUntil(
      () =>
        persistMocks.markRunWaiting.mock.calls.length > 0 &&
        persistMocks.markRunStepStatus.mock.calls.some((call) => {
          const arg = call[0] as unknown;
          if (!arg || typeof arg !== "object") return false;
          const rec = arg as Record<string, unknown>;
          return (
            rec.runId === "run_1" &&
            rec.stepId === "approval.merge" &&
            rec.status === "waiting"
          );
        }),
    );

    // Resolve the approval to unblock the run, and allow remaining approval gates
    // to resolve immediately via the default mock.
    resolveApproval({
      approvalId: "approval_repo.merge",
      approvedAt: "2026-02-09T00:00:00Z",
      approvedBy: "user@example.com",
      scope: "repo.merge",
    });

    await expect(runPromise).resolves.toEqual({ ok: true });

    expect(persistMocks.finishRunStep).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run_1",
        status: "succeeded",
        stepId: "approval.merge",
      }),
    );
  });
});
