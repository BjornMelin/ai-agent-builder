import "server-only";

import { AppError } from "@/lib/core/errors";
import type { DeploymentDto } from "@/lib/data/deployments.server";
import {
  createDeploymentRecord,
  updateDeploymentRecord,
} from "@/lib/data/deployments.server";
import type { ManualFallbackArtifact } from "@/lib/providers/manual-fallback.server";
import {
  buildResourceNameHint,
  createManualFallbackArtifact,
} from "@/lib/providers/manual-fallback.server";
import {
  createDeployment,
  ensureProject,
  isVercelApiConfigured,
  pollDeployment,
  type VercelDeploymentPollResult,
  type VercelDeploymentRef,
  type VercelProjectRef,
} from "@/lib/providers/vercel.server";

function toHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

/**
 * Production deploy result for an implementation run.
 */
export type ImplementationProductionDeployResult =
  | Readonly<{
      kind: "manual";
      artifact: ManualFallbackArtifact;
      deployment: DeploymentDto;
    }>
  | Readonly<{
      kind: "automated";
      project: VercelProjectRef;
      deploymentRef: VercelDeploymentRef;
      poll: VercelDeploymentPollResult;
      deployment: DeploymentDto;
    }>;

/**
 * Deploy the implementation run branch to production on Vercel (approval-gated).
 *
 * @remarks
 * When the Vercel API token is not configured, this step creates a deterministic
 * manual fallback artifact and a deployment record with status `manual_required`.
 *
 * Secrets are never persisted. Env var writes are intentionally out of scope
 * for this foundation.
 *
 * @param input - Project/run scope + GitHub ref identity.
 * @returns Deploy result (manual or automated).
 */
export async function deployImplementationToProductionStep(
  input: Readonly<{
    projectId: string;
    runId: string;
    projectSlug: string;
    repoOwner: string;
    repoName: string;
    ref: string;
    sha?: string;
  }>,
): Promise<ImplementationProductionDeployResult> {
  "use step";

  const resourceNameHint = buildResourceNameHint({
    prefix: "vercel",
    projectSlug: input.projectSlug,
    runId: input.runId,
  });

  if (!isVercelApiConfigured()) {
    const artifact = createManualFallbackArtifact({
      provider: "vercel",
      resourceNameHint,
      steps: [
        "Open Vercel and import the GitHub repository.",
        `Repo: ${input.repoOwner}/${input.repoName}`,
        `Suggested project name: ${resourceNameHint}`,
        `Production branch: ${input.ref}`,
        "Trigger a production deployment (Vercel dashboard or CLI).",
        "Verify the deployment is healthy and record the deployment URL in your change log.",
      ],
      title:
        "Manual Vercel production deployment steps (VERCEL_TOKEN not configured)",
    });

    const deployment = await createDeploymentRecord({
      metadata: { manual: artifact },
      projectId: input.projectId,
      provider: "vercel",
      runId: input.runId,
      startedAt: new Date(),
      status: "manual_required",
    });

    return { artifact, deployment, kind: "manual" };
  }

  const project = await ensureProject({
    gitHubRepo: { owner: input.repoOwner, repo: input.repoName },
    name: resourceNameHint,
  });

  const deploymentRecord = await createDeploymentRecord({
    metadata: {
      gitHub: project.gitHub,
      projectCreated: project.created,
      target: "production",
    },
    projectId: input.projectId,
    provider: "vercel",
    runId: input.runId,
    startedAt: new Date(),
    status: "running",
    vercelProjectId: project.projectId,
  });

  let deploymentRef: VercelDeploymentRef;
  try {
    deploymentRef = await createDeployment({
      gitHub: {
        owner: input.repoOwner,
        ref: input.ref,
        repo: input.repoName,
        ...(input.sha ? { sha: input.sha } : {}),
      },
      meta: {
        runId: input.runId,
      },
      name: `${resourceNameHint}-production`,
      projectId: project.projectId,
      target: "production",
    });
  } catch (err) {
    await updateDeploymentRecord(deploymentRecord.id, {
      endedAt: new Date(),
      status: "failed",
    });
    throw err;
  }

  await updateDeploymentRecord(deploymentRecord.id, {
    deploymentUrl: toHttpsUrl(deploymentRef.url),
    metadata: {
      ...deploymentRecord.metadata,
      deployment: {
        alias: deploymentRef.alias,
        createdAt: deploymentRef.createdAt,
        inspectorUrl: deploymentRef.inspectorUrl,
        readyState: deploymentRef.readyState,
        status: deploymentRef.status,
        target: deploymentRef.target,
        url: deploymentRef.url,
      },
    },
    status: deploymentRef.status || "running",
    vercelDeploymentId: deploymentRef.deploymentId,
    vercelProjectId: deploymentRef.projectId,
  });

  const poll = await pollDeployment({
    deploymentId: deploymentRef.deploymentId,
    intervalMs: 2_000,
    timeoutMs: 10 * 60_000,
  });

  if (poll.kind === "terminal") {
    const terminalStatus =
      poll.readyState === "READY"
        ? "succeeded"
        : poll.readyState === "CANCELED"
          ? "canceled"
          : "failed";

    const endedAt = new Date();
    const updated = await updateDeploymentRecord(deploymentRecord.id, {
      ...(poll.url ? { deploymentUrl: toHttpsUrl(poll.url) } : {}),
      endedAt,
      metadata: {
        ...deploymentRecord.metadata,
        poll: {
          alias: poll.alias,
          errorMessage: poll.errorMessage,
          pollCount: poll.pollCount,
          readyState: poll.readyState,
          readyStateReason: poll.readyStateReason,
          status: poll.status,
          target: poll.target,
          url: poll.url,
          waitedMs: poll.waitedMs,
        },
      },
      status: terminalStatus,
    });

    if (terminalStatus !== "succeeded") {
      throw new AppError(
        "bad_gateway",
        502,
        `Vercel deployment ended in state ${poll.readyState ?? "unknown"}.`,
      );
    }

    return {
      deployment: updated,
      deploymentRef,
      kind: "automated",
      poll,
      project,
    };
  }

  const updated = await updateDeploymentRecord(deploymentRecord.id, {
    metadata: {
      ...deploymentRecord.metadata,
      poll: {
        kind: poll.kind,
        pollCount: poll.pollCount,
        waitedMs: poll.waitedMs,
      },
    },
    status: "timeout",
  });

  throw new AppError(
    "gateway_timeout",
    504,
    "Vercel deployment poll timed out.",
    { deployment: updated.id, vercelDeploymentId: deploymentRef.deploymentId },
  );
}
