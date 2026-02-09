import "server-only";

import { ensureInfraResourceRecord } from "@/lib/data/infra-resources.server";
import {
  ensureNeonProvisioning,
  type NeonProvisioningResult,
} from "@/lib/providers/neon.server";
import {
  ensureUpstashProvisioning,
  type UpstashProvisioningResult,
} from "@/lib/providers/upstash.server";

/**
 * Provisioning outputs for an implementation run.
 */
export type ImplementationProvisioningResult = Readonly<{
  neon: NeonProvisioningResult;
  upstash: UpstashProvisioningResult;
}>;

/**
 * Provision (or connect) target infrastructure for an implementation run.
 *
 * @remarks
 * This step records only non-secret metadata and external IDs. Secrets (tokens,
 * connection strings) are never persisted.
 *
 * The workflow MUST gate this step behind an approval with scope
 * `infra.provision` (FR-031).
 *
 * @param input - Project + run scope.
 * @returns Provisioning summary.
 */
export async function provisionImplementationInfraStep(
  input: Readonly<{ projectId: string; projectSlug: string; runId: string }>,
): Promise<ImplementationProvisioningResult> {
  "use step";

  const [neon, upstash] = await Promise.all([
    ensureNeonProvisioning({
      projectSlug: input.projectSlug,
      runId: input.runId,
    }),
    ensureUpstashProvisioning({
      projectSlug: input.projectSlug,
      runId: input.runId,
    }),
  ]);

  if (neon.kind === "automated") {
    await ensureInfraResourceRecord({
      externalId: neon.projectId,
      metadata: {
        projectName: neon.projectName,
      },
      projectId: input.projectId,
      provider: "neon",
      resourceType: "neon.project",
      runId: input.runId,
    });
  }

  if (upstash.kind === "automated") {
    await ensureInfraResourceRecord({
      externalId: upstash.redis.databaseId,
      metadata: {
        databaseName: upstash.redis.databaseName,
        endpoint: upstash.redis.endpoint,
        restUrl: upstash.redis.restUrl,
      },
      projectId: input.projectId,
      provider: "upstash",
      region: upstash.redis.primaryRegion,
      resourceType: "upstash.redis",
      runId: input.runId,
    });

    await ensureInfraResourceRecord({
      externalId: upstash.vector.indexId,
      metadata: {
        dimensionCount: upstash.vector.dimensionCount,
        endpoint: upstash.vector.endpoint,
        indexName: upstash.vector.indexName,
        restUrl: upstash.vector.restUrl,
        similarityFunction: upstash.vector.similarityFunction,
      },
      projectId: input.projectId,
      provider: "upstash",
      region: upstash.vector.region,
      resourceType: "upstash.vector",
      runId: input.runId,
    });
  }

  return { neon, upstash };
}
