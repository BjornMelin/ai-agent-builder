import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/net/fetch-with-timeout.server";
import {
  buildResourceNameHint,
  createManualFallbackArtifact,
  type ManualFallbackArtifact,
} from "@/lib/providers/manual-fallback.server";

/**
 * Neon provisioning result used by Implementation Runs.
 */
export type NeonProvisioningResult =
  | Readonly<{
      kind: "automated";
      provider: "neon";
      projectId: string;
      projectName: string;
      /**
       * Manual steps required to configure credentials without persisting secrets.
       */
      artifact: ManualFallbackArtifact;
    }>
  | Readonly<{
      kind: "manual";
      provider: "neon";
      artifact: ManualFallbackArtifact;
    }>;

const NEON_API_BASE_URL = "https://console.neon.tech/api/v2";

function isNeonConfigured(): boolean {
  const key = process.env.NEON_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

function toNeonApiUrl(path: string, query?: Readonly<Record<string, string>>) {
  const url = new URL(`${NEON_API_BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

async function neonApiJson(
  input: Readonly<{
    method: "GET" | "POST";
    path: string;
    query?: Readonly<Record<string, string>>;
    body?: unknown;
  }>,
): Promise<unknown> {
  const config = env.neonApi;
  const url = toNeonApiUrl(input.path, input.query);
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...(input.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      method: input.method,
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    },
    { timeoutMs: 15_000 },
  );

  if (!res.ok) {
    // Avoid leaking provider response bodies (may contain secrets).
    const status = res.status;
    if (status === 401 || status === 403) {
      throw new AppError(
        "provider_auth_failed",
        502,
        `Neon API request failed (${status}). Check NEON_API_KEY permissions.`,
      );
    }
    throw new AppError(
      "provider_error",
      502,
      `Neon API request failed (${status}).`,
    );
  }

  return (await res.json()) as unknown;
}

async function findNeonProjectByName(
  name: string,
): Promise<Readonly<{ id: string; name: string }> | null> {
  const data = await neonApiJson({
    method: "GET",
    path: "/projects",
    query: { limit: "400", search: name },
  });

  const parsed = z
    .object({
      projects: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
          }),
        )
        .default([]),
    })
    .safeParse(data);

  if (!parsed.success) {
    throw new AppError(
      "provider_error",
      502,
      "Neon API returned an unexpected projects response.",
      parsed.error,
    );
  }

  const match = parsed.data.projects.find((p) => p.name === name);
  return match ? { id: match.id, name: match.name } : null;
}

async function createNeonProject(
  name: string,
): Promise<Readonly<{ id: string; name: string }>> {
  const data = await neonApiJson({
    body: { project: { name } },
    method: "POST",
    path: "/projects",
  });

  const parsed = z
    .object({
      project: z.object({
        id: z.string(),
        name: z.string(),
      }),
    })
    .safeParse(data);

  if (!parsed.success) {
    throw new AppError(
      "provider_error",
      502,
      "Neon API returned an unexpected create-project response.",
      parsed.error,
    );
  }

  return parsed.data.project;
}

/**
 * Resolve Neon provisioning for a target app.
 *
 * @remarks
 * This foundation implementation returns a deterministic manual fallback when
 * the Neon API is not configured. When `NEON_API_KEY` is configured, it
 * provisions (or reuses) a Neon project using the Neon Platform API.
 *
 * @param input - Provisioning scope (project + run identity).
 * @returns Provisioning result.
 */
export async function ensureNeonProvisioning(
  input: Readonly<{ projectSlug: string; runId: string }>,
): Promise<NeonProvisioningResult> {
  if (isNeonConfigured()) {
    const resourceNameHint = buildResourceNameHint({
      prefix: "neon",
      projectSlug: input.projectSlug,
      runId: input.runId,
    });

    const existing = await findNeonProjectByName(resourceNameHint);
    const project = existing ?? (await createNeonProject(resourceNameHint));

    // Neon returns credentials (e.g. role passwords / connection URIs) as part of
    // some responses. We intentionally do not return or persist secrets; instead
    // return deterministic manual steps to retrieve credentials safely.
    const artifact = createManualFallbackArtifact({
      provider: "neon",
      resourceNameHint,
      steps: [
        "Open Neon and locate the provisioned project.",
        `Project name: ${resourceNameHint}`,
        "Create or retrieve a database user + password (store the password in your secret manager).",
        "Copy a pooled connection string and set DATABASE_URL for the target app (do not paste secrets back into this app).",
        "Confirm migrations run and the app can connect.",
      ],
      title: "Neon credentials setup (secrets are not persisted by automation)",
    });

    return {
      artifact,
      kind: "automated",
      projectId: project.id,
      projectName: project.name,
      provider: "neon",
    };
  }

  const resourceNameHint = buildResourceNameHint({
    prefix: "neon",
    projectSlug: input.projectSlug,
    runId: input.runId,
  });

  const artifact = createManualFallbackArtifact({
    provider: "neon",
    resourceNameHint,
    steps: [
      "Create a Neon project and database.",
      `Name suggestion: ${resourceNameHint}`,
      "Create a database user + password (store the password in your secret manager).",
      "Set DATABASE_URL for the target app to the Neon connection string (do not paste secrets back into this app).",
      "Confirm migrations run and the app can connect.",
    ],
    title: "Manual Neon provisioning steps (Neon API not configured)",
  });

  return { artifact, kind: "manual", provider: "neon" };
}

/**
 * Backwards-compatible alias for the historical resolver name.
 *
 * @deprecated Prefer {@link ensureNeonProvisioning}.
 */
export const resolveNeonProvisioning = ensureNeonProvisioning;
