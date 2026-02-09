import "server-only";

import { type NetworkPolicy, Sandbox } from "@vercel/sandbox";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";

type SandboxGitSource =
  | Readonly<{
      type: "git";
      url: string;
      depth?: number;
      revision?: string;
    }>
  | Readonly<{
      type: "git";
      url: string;
      username: string;
      password: string;
      depth?: number;
      revision?: string;
    }>;

/**
 * Create a new Vercel Sandbox instance using the repo's env contract.
 *
 * @param input - Sandbox creation options.
 * @returns Sandbox instance.
 */
export async function createVercelSandbox(
  input: Readonly<{
    source?: SandboxGitSource;
    timeoutMs: number;
    runtime?: "node24" | "node22" | "python3.13";
    vcpus?: number;
    ports?: number[];
    networkPolicy?: NetworkPolicy;
  }>,
): Promise<Sandbox> {
  const sandboxEnv = env.sandbox;

  if (sandboxEnv.auth === "oidc") {
    const sandbox = await Sandbox.create({
      ...(input.networkPolicy === undefined
        ? {}
        : { networkPolicy: input.networkPolicy }),
      ...(input.ports === undefined ? {} : { ports: input.ports }),
      ...(input.source === undefined ? {} : { source: input.source }),
      resources: { vcpus: input.vcpus ?? 2 },
      runtime: input.runtime ?? "node24",
      timeout: input.timeoutMs,
    });
    return sandbox;
  }

  if (!sandboxEnv.teamId) {
    throw new AppError(
      "env_invalid",
      500,
      'Invalid environment for feature "sandbox": missing VERCEL_TEAM_ID for access-token auth.',
    );
  }

  const sandbox = await Sandbox.create({
    ...(input.networkPolicy === undefined
      ? {}
      : { networkPolicy: input.networkPolicy }),
    ...(input.ports === undefined ? {} : { ports: input.ports }),
    ...(input.source === undefined ? {} : { source: input.source }),
    projectId: sandboxEnv.projectId,
    resources: { vcpus: input.vcpus ?? 2 },
    runtime: input.runtime ?? "node24",
    teamId: sandboxEnv.teamId,
    timeout: input.timeoutMs,
    token: sandboxEnv.token,
  });
  return sandbox;
}

/**
 * Retrieve an existing sandbox by ID.
 *
 * @param sandboxId - Sandbox ID.
 * @returns Sandbox instance.
 */
export async function getVercelSandbox(sandboxId: string): Promise<Sandbox> {
  const sandboxEnv = env.sandbox;

  if (sandboxEnv.auth === "oidc") {
    return await Sandbox.get({ sandboxId });
  }

  if (!sandboxEnv.teamId) {
    throw new AppError(
      "env_invalid",
      500,
      'Invalid environment for feature "sandbox": missing VERCEL_TEAM_ID for access-token auth.',
    );
  }

  return await Sandbox.get({
    projectId: sandboxEnv.projectId,
    sandboxId,
    teamId: sandboxEnv.teamId,
    token: sandboxEnv.token,
  });
}
