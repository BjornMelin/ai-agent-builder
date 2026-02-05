import "server-only";

import { indexArtifactVersion } from "@/lib/artifacts/index-artifact.server";
import { env } from "@/lib/env";
import { getQstashClient } from "@/lib/upstash/qstash.server";

type EnqueueIndexInput = Readonly<{
  projectId: string;
  artifactId: string;
  kind: string;
  logicalKey: string;
  version: number;
}>;

/**
 * Enqueue an artifact indexing job (QStash), with local fallback.
 *
 * @remarks
 * - On Vercel, QStash must be configured; failures are propagated.
 * - Locally, we fall back to inline indexing to avoid requiring tunneling.
 *
 * @param input - Artifact indexing job input.
 */
export async function enqueueArtifactIndexing(
  input: EnqueueIndexInput,
): Promise<void> {
  const dedupe = `index-artifact:${input.projectId}:${input.kind}:${input.logicalKey}:v${input.version}`;

  try {
    const qstash = getQstashClient();
    await qstash.publishJSON({
      body: input,
      deduplicationId: dedupe,
      label: "index-artifact",
      url: `${env.app.baseUrl}/api/jobs/index-artifact`,
    });
  } catch (err) {
    if (env.runtime.isVercel) {
      throw err;
    }
    // Best-effort local fallback (keeps dev usable without QStash).
    await indexArtifactVersion(input).catch(() => {
      // Ignore inline indexing errors in local fallback mode.
    });
  }
}
