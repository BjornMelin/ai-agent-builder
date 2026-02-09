import "server-only";

import type { Vercel } from "@vercel/sdk";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";

function hasNonEmptyEnv(key: string): boolean {
  const value = process.env[key];
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Feature gate for Vercel API access (deployment automation).
 *
 * @returns True when the Vercel API token is present.
 */
export function isVercelApiConfigured(): boolean {
  return hasNonEmptyEnv("VERCEL_TOKEN");
}

/**
 * Create a Vercel SDK client when configured.
 *
 * @remarks
 * Returns `null` when `VERCEL_TOKEN` is missing so builds/tests do not require
 * provider credentials unless the feature is invoked.
 *
 * @returns Vercel client or null.
 */
export async function getVercelClientOrNull(): Promise<Vercel | null> {
  if (!isVercelApiConfigured()) {
    return null;
  }

  const { Vercel: VercelClient } = await import("@vercel/sdk");
  const config = env.vercelApi;

  return new VercelClient({
    bearerToken: config.token,
  });
}

async function getVercelClientOrThrow(): Promise<Vercel> {
  const client = await getVercelClientOrNull();
  if (!client) {
    throw new AppError(
      "env_invalid",
      500,
      'Invalid environment for feature "vercelApi": missing VERCEL_TOKEN. See docs/ops/env.md.',
    );
  }
  return client;
}

function getTeamIdOrUndefined(): string | undefined {
  // Access env contract only when configured.
  const teamId = env.vercelApi.teamId;
  return typeof teamId === "string" && teamId.trim().length > 0
    ? teamId.trim()
    : undefined;
}

function toNonEmptyTrimmed(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError("bad_request", 400, "Invalid input.");
  }
  return trimmed;
}

/**
 * Minimal Vercel GitHub link reference (non-secret).
 */
export type VercelGitHubLinkRef = Readonly<{
  provider: "github";
  owner: string;
  repo: string;
  productionBranch: string | null;
}>;

/**
 * Minimal Vercel project reference returned by DeployOps functions.
 */
export type VercelProjectRef = Readonly<{
  projectId: string;
  name: string;
  created: boolean;
  gitHub: VercelGitHubLinkRef | null;
}>;

/**
 * Vercel deployment creation result (non-secret).
 */
export type VercelDeploymentRef = Readonly<{
  deploymentId: string;
  projectId: string;
  name: string;
  url: string;
  readyState: string;
  status: string;
  createdAt: number;
  inspectorUrl: string | null;
  target: string | null;
  alias: readonly string[];
}>;

/**
 * Deployment poll result (non-secret).
 */
export type VercelDeploymentPollResult = Readonly<{
  kind: "terminal" | "timeout";
  deploymentId: string;
  projectId: string | null;
  url: string | null;
  readyState: string | null;
  status: string | null;
  target: string | null;
  alias: readonly string[];
  errorMessage: string | null;
  readyStateReason: string | null;
  waitedMs: number;
  pollCount: number;
}>;

/**
 * Vercel env var target environments.
 */
export type VercelEnvTarget = "production" | "preview" | "development";

/**
 * Vercel env var storage type.
 */
export type VercelEnvVarType =
  | "system"
  | "secret"
  | "encrypted"
  | "plain"
  | "sensitive";

/**
 * Input for upserting Vercel project env vars.
 *
 * @remarks
 * `value` is treated as secret. Do not persist it in DB, logs, or artifacts.
 */
export type VercelEnvVarUpsertInput = Readonly<{
  key: string;
  value: string;
  targets: readonly VercelEnvTarget[];
  type?: VercelEnvVarType;
  gitBranch?: string | null;
  comment?: string;
}>;

/**
 * Sanitized env var reference returned by {@link upsertEnvVars}.
 */
export type VercelEnvVarRef = Readonly<{
  id: string | null;
  key: string;
  type: string | null;
  targets: readonly VercelEnvTarget[];
  gitBranch: string | null;
  comment: string | null;
}>;

/**
 * Result from upserting env vars (non-secret; values are omitted).
 */
export type VercelEnvVarUpsertResult = Readonly<{
  created: readonly VercelEnvVarRef[];
  failed: readonly Readonly<{ code: string; key: string | null }>[];
}>;

function extractGitHubLink(link: unknown): VercelGitHubLinkRef | null {
  if (typeof link !== "object" || link === null) return null;
  const record = link as Record<string, unknown>;
  if (record.type !== "github") return null;

  const owner = record.org;
  const repo = record.repo;
  if (typeof owner !== "string" || owner.trim().length === 0) return null;
  if (typeof repo !== "string" || repo.trim().length === 0) return null;

  const productionBranch =
    typeof record.productionBranch === "string" && record.productionBranch
      ? record.productionBranch
      : null;

  return {
    owner,
    productionBranch,
    provider: "github",
    repo,
  };
}

function normalizeTargets(value: unknown): readonly VercelEnvTarget[] {
  const allowed = new Set<VercelEnvTarget>([
    "production",
    "preview",
    "development",
  ]);

  const coerce = (v: unknown): VercelEnvTarget | null => {
    if (v === "production" || v === "preview" || v === "development") return v;
    return null;
  };

  if (Array.isArray(value)) {
    const normalized = value
      .map(coerce)
      .filter((v): v is VercelEnvTarget => v !== null);
    return normalized.filter((v) => allowed.has(v));
  }

  const single = coerce(value);
  return single ? [single] : [];
}

function isTerminalReadyState(value: string | null): boolean {
  return value === "READY" || value === "ERROR" || value === "CANCELED";
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Ensure a Vercel project exists (idempotent by name).
 *
 * @remarks
 * When `gitHubRepo` is provided, the resolved project must already be linked to
 * that repo (or be created with that link). This avoids deploying the wrong repo.
 *
 * @param input - Desired project name and optional GitHub link.
 * @returns Project reference (non-secret).
 * @throws AppError - When Vercel API is not configured or the project link mismatches.
 */
export async function ensureProject(
  input: Readonly<{
    name: string;
    gitHubRepo?: Readonly<{ owner: string; repo: string }>;
  }>,
): Promise<VercelProjectRef> {
  const client = await getVercelClientOrThrow();
  const teamId = getTeamIdOrUndefined();
  const name = toNonEmptyTrimmed(input.name);

  const list = await client.projects.getProjects({
    limit: "20",
    search: name,
    ...(teamId ? { teamId } : {}),
  });

  const projects = Array.isArray(list) ? list : list.projects;
  const existing = projects.find((p) => p.name === name) ?? null;

  if (existing) {
    const gitHub = extractGitHubLink(existing.link);
    if (input.gitHubRepo) {
      const desiredOwner = toNonEmptyTrimmed(input.gitHubRepo.owner);
      const desiredRepo = toNonEmptyTrimmed(input.gitHubRepo.repo);

      if (!gitHub) {
        throw new AppError(
          "conflict",
          409,
          "Vercel project exists but is not linked to the expected GitHub repository.",
        );
      }

      if (gitHub.owner !== desiredOwner || gitHub.repo !== desiredRepo) {
        throw new AppError(
          "conflict",
          409,
          "Vercel project exists but is linked to a different GitHub repository.",
        );
      }
    }

    return {
      created: false,
      gitHub,
      name: existing.name,
      projectId: existing.id,
    };
  }

  try {
    const created = await client.projects.createProject({
      requestBody: {
        ...(input.gitHubRepo
          ? {
              gitRepository: {
                repo: `${toNonEmptyTrimmed(input.gitHubRepo.owner)}/${toNonEmptyTrimmed(
                  input.gitHubRepo.repo,
                )}`,
                type: "github",
              },
            }
          : {}),
        name,
      },
      ...(teamId ? { teamId } : {}),
    });

    return {
      created: true,
      gitHub: extractGitHubLink(created.link),
      name: created.name,
      projectId: created.id,
    };
  } catch (err) {
    // If the project was created concurrently, attempt to resolve it by listing again.
    const retryList = await client.projects.getProjects({
      limit: "20",
      search: name,
      ...(teamId ? { teamId } : {}),
    });
    const retryProjects = Array.isArray(retryList)
      ? retryList
      : retryList.projects;
    const retryExisting = retryProjects.find((p) => p.name === name) ?? null;
    if (retryExisting) {
      const gitHub = extractGitHubLink(retryExisting.link);
      return {
        created: false,
        gitHub,
        name: retryExisting.name,
        projectId: retryExisting.id,
      };
    }

    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError("bad_gateway", 502, "Failed to ensure Vercel project.");
  }
}

/**
 * Upsert Vercel project environment variables.
 *
 * @remarks
 * This call is approval-gated at the workflow layer. It never returns env var values.
 *
 * @param input - Project identifier and env var values.
 * @returns Upsert results with values omitted.
 * @throws AppError - When Vercel API is not configured or the request fails.
 */
export async function upsertEnvVars(
  input: Readonly<{
    projectId: string;
    envVars: readonly VercelEnvVarUpsertInput[];
  }>,
): Promise<VercelEnvVarUpsertResult> {
  const client = await getVercelClientOrThrow();
  const teamId = getTeamIdOrUndefined();

  if (input.envVars.length === 0) {
    return { created: [], failed: [] };
  }

  const requestBody = input.envVars.map((v) => ({
    comment: v.comment,
    gitBranch: v.gitBranch,
    key: toNonEmptyTrimmed(v.key),
    target: [...v.targets],
    type: v.type ?? "encrypted",
    value: v.value,
  }));

  try {
    const res = await client.projects.createProjectEnv({
      idOrName: toNonEmptyTrimmed(input.projectId),
      requestBody,
      ...(teamId ? { teamId } : {}),
      upsert: "true",
    });

    const createdList = Array.isArray(res.created)
      ? res.created
      : [res.created];
    const created = createdList.map<VercelEnvVarRef>((item) => ({
      comment: typeof item.comment === "string" ? item.comment : null,
      gitBranch: typeof item.gitBranch === "string" ? item.gitBranch : null,
      id: typeof item.id === "string" ? item.id : null,
      key: item.key,
      targets: normalizeTargets(item.target),
      type: typeof item.type === "string" ? item.type : null,
    }));

    const failed = res.failed.map((item) => ({
      code: item.error.code,
      key:
        typeof item.error.key === "string"
          ? item.error.key
          : typeof item.error.envVarKey === "string"
            ? item.error.envVarKey
            : null,
    }));

    return { created, failed };
  } catch {
    // Avoid attaching the underlying error as a cause because it may include secret env var values.
    throw new AppError(
      "bad_gateway",
      502,
      "Failed to upsert Vercel environment variables.",
    );
  }
}

/**
 * Create a Git deployment in Vercel for a project.
 *
 * @param input - Deployment inputs.
 * @returns Deployment reference (non-secret).
 * @throws AppError - When Vercel API is not configured or the deployment cannot be created.
 */
export async function createDeployment(
  input: Readonly<{
    projectId: string;
    name: string;
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
  const client = await getVercelClientOrThrow();
  const teamId = getTeamIdOrUndefined();

  try {
    const res = await client.deployments.createDeployment({
      requestBody: {
        gitSource: {
          org: toNonEmptyTrimmed(input.gitHub.owner),
          ref: toNonEmptyTrimmed(input.gitHub.ref),
          repo: toNonEmptyTrimmed(input.gitHub.repo),
          ...(input.gitHub.sha ? { sha: input.gitHub.sha } : {}),
          type: "github",
        },
        ...(input.meta === undefined ? {} : { meta: input.meta }),
        name: toNonEmptyTrimmed(input.name),
        project: toNonEmptyTrimmed(input.projectId),
        ...(input.target === "production" ? { target: "production" } : {}),
      },
      ...(teamId ? { teamId } : {}),
    });

    return {
      alias: [...(res.alias ?? [])],
      createdAt: res.createdAt,
      deploymentId: res.id,
      inspectorUrl: res.inspectorUrl,
      name: res.name,
      projectId: res.projectId,
      readyState: res.readyState,
      status: res.status,
      target: res.target ?? null,
      url: res.url,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "bad_gateway",
      502,
      "Failed to create Vercel deployment.",
    );
  }
}

/**
 * Poll a Vercel deployment until it reaches a terminal readyState.
 *
 * @remarks
 * This function is bounded by {@link timeoutMs}; callers can decide whether a
 * "timeout" should fail the run or be retried later.
 *
 * @param input - Poll inputs.
 * @returns Terminal or timeout result (non-secret).
 */
export async function pollDeployment(
  input: Readonly<{
    deploymentId: string;
    timeoutMs?: number;
    intervalMs?: number;
  }>,
): Promise<VercelDeploymentPollResult> {
  const client = await getVercelClientOrThrow();
  const teamId = getTeamIdOrUndefined();

  const timeoutMs = Math.max(input.timeoutMs ?? 60_000, 1);
  const intervalMs = Math.max(input.intervalMs ?? 2_000, 0);

  const startedAt = Date.now();
  let pollCount = 0;

  let last: Omit<
    VercelDeploymentPollResult,
    "kind" | "waitedMs" | "pollCount"
  > | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    pollCount += 1;

    const deployment = await client.deployments.getDeployment({
      idOrUrl: toNonEmptyTrimmed(input.deploymentId),
      ...(teamId ? { teamId } : {}),
    });

    const readyStateReasonRaw =
      "readyStateReason" in deployment
        ? (deployment as { readyStateReason?: unknown }).readyStateReason
        : undefined;

    const readyStateReason =
      typeof readyStateReasonRaw === "string" && readyStateReasonRaw.length > 0
        ? readyStateReasonRaw
        : null;

    const projectIdRaw =
      "projectId" in deployment
        ? (deployment as { projectId?: unknown }).projectId
        : undefined;

    const projectId =
      typeof projectIdRaw === "string"
        ? projectIdRaw
        : typeof projectIdRaw === "number"
          ? String(projectIdRaw)
          : null;

    last = {
      alias: [...(deployment.alias ?? [])],
      deploymentId: deployment.id,
      errorMessage:
        typeof deployment.errorMessage === "string" &&
        deployment.errorMessage.length > 0
          ? deployment.errorMessage
          : null,
      projectId,
      readyState: deployment.readyState ?? null,
      readyStateReason,
      status: deployment.status ?? null,
      target: deployment.target ?? null,
      url: deployment.url ?? null,
    };

    if (isTerminalReadyState(last.readyState)) {
      return {
        ...last,
        kind: "terminal",
        pollCount,
        waitedMs: Date.now() - startedAt,
      };
    }

    await sleepMs(intervalMs);
  }

  return {
    ...(last ?? {
      alias: [],
      deploymentId: toNonEmptyTrimmed(input.deploymentId),
      errorMessage: null,
      projectId: null,
      readyState: null,
      readyStateReason: null,
      status: null,
      target: null,
      url: null,
    }),
    kind: "timeout",
    pollCount,
    waitedMs: Date.now() - startedAt,
  };
}
