import "server-only";

import {
  createDeployment,
  ensureProject,
  pollDeployment,
  upsertEnvVars,
  type VercelDeploymentPollResult,
  type VercelDeploymentRef,
  type VercelEnvVarUpsertInput,
  type VercelEnvVarUpsertResult,
  type VercelProjectRef,
} from "@/lib/providers/vercel.server";

/**
 * Ensure the Vercel project exists and is linked to the expected GitHub repo.
 *
 * @remarks
 * Wrapped in a Workflow DevKit step to avoid duplicate project creation during
 * deterministic replays.
 *
 * @param input - Vercel project name + desired GitHub repo link.
 * @returns Vercel project reference (non-secret).
 */
export async function ensureVercelProject(
  input: Readonly<{
    vercelProjectName: string;
    gitHubRepo?: Readonly<{ owner: string; repo: string }>;
  }>,
): Promise<VercelProjectRef> {
  "use step";

  return await ensureProject({
    name: input.vercelProjectName,
    ...(input.gitHubRepo === undefined ? {} : { gitHubRepo: input.gitHubRepo }),
  });
}

/**
 * Upsert Vercel env vars for a project (approval-gated at the workflow layer).
 *
 * @remarks
 * `envVars[].value` is treated as secret and must never be persisted in DB,
 * logs, or artifacts. This step returns only non-secret metadata.
 *
 * @param input - Vercel project ID and env vars to upsert.
 * @returns Upsert results with values omitted.
 */
export async function upsertVercelEnvVars(
  input: Readonly<{
    vercelProjectId: string;
    envVars: readonly VercelEnvVarUpsertInput[];
  }>,
): Promise<VercelEnvVarUpsertResult> {
  "use step";

  return await upsertEnvVars({
    envVars: input.envVars,
    projectId: input.vercelProjectId,
  });
}

/**
 * Create a Vercel deployment from a GitHub ref.
 *
 * @param input - Deployment inputs.
 * @returns Deployment reference (non-secret).
 */
export async function createVercelDeployment(
  input: Readonly<{
    vercelProjectId: string;
    deploymentName: string;
    gitHub: Readonly<{
      owner: string;
      repo: string;
      ref: string;
      sha?: string;
    }>;
    target?: "production" | "preview";
    meta?: Record<string, string>;
  }>,
): Promise<VercelDeploymentRef> {
  "use step";

  return await createDeployment({
    gitHub: input.gitHub,
    name: input.deploymentName,
    projectId: input.vercelProjectId,
    ...(input.meta === undefined ? {} : { meta: input.meta }),
    ...(input.target === undefined ? {} : { target: input.target }),
  });
}

/**
 * Poll a Vercel deployment until it reaches a terminal readyState (bounded).
 *
 * @param input - Poll inputs.
 * @returns Terminal or timeout result (non-secret).
 */
export async function pollVercelDeployment(
  input: Readonly<{
    vercelDeploymentId: string;
    timeoutMs?: number;
    intervalMs?: number;
  }>,
): Promise<VercelDeploymentPollResult> {
  "use step";

  return await pollDeployment({
    deploymentId: input.vercelDeploymentId,
    ...(input.intervalMs === undefined ? {} : { intervalMs: input.intervalMs }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
}
