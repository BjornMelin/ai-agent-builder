import "server-only";

import { enqueueArtifactIndexing } from "@/lib/artifacts/enqueue-indexing.server";
import { createArtifactVersion } from "@/lib/data/artifacts.server";
import {
  buildAndUploadImplementationAuditBundle,
  type ImplementationAuditBundleBuildResult,
} from "@/lib/export/implementation-audit-bundle.server";

/**
 * Create a run summary artifact and enqueue indexing.
 *
 * @remarks
 * This is a minimal end-to-end integration point proving:
 * - artifact versioning + persistence
 * - optional background indexing for retrieval/search
 *
 * @param input - Run identity and metadata.
 * @returns Created artifact ID + version.
 */
export async function createRunSummaryArtifact(
  input: Readonly<{
    projectId: string;
    runId: string;
    kind: "research" | "implementation";
    workflowRunId: string;
    status: "succeeded" | "failed" | "canceled";
  }>,
): Promise<Readonly<{ artifactId: string; version: number }>> {
  "use step";

  const artifact = await createArtifactVersion({
    content: {
      format: "markdown",
      markdown: `**Run summary**\n\n- Run: \`${input.runId}\`\n- Kind: \`${input.kind}\`\n- Status: \`${input.status}\`\n- Workflow: \`${input.workflowRunId}\``,
      title: `Run ${input.runId}`,
    },
    kind: "RUN_SUMMARY",
    logicalKey: `run:${input.runId}`,
    projectId: input.projectId,
    runId: input.runId,
  });

  await enqueueArtifactIndexing({
    artifactId: artifact.id,
    kind: artifact.kind,
    logicalKey: artifact.logicalKey,
    projectId: artifact.projectId,
    version: artifact.version,
  });

  return { artifactId: artifact.id, version: artifact.version };
}

export type ImplementationAuditBundleResult = Readonly<
  {
    artifactId: string;
    version: number;
    blobUrl: string;
    sha256: string;
    bytes: number;
  } & Pick<ImplementationAuditBundleBuildResult, "manifest">
>;

/**
 * Create an implementation audit bundle ZIP and persist it as an artifact.
 *
 * @remarks
 * This is the minimal foundation for FR-034 (audit bundle export). It packages
 * run/step state, sandbox job provenance, approvals, deployments, repo metadata,
 * and the artifacts produced by the run. Secrets are never stored; logs are
 * already redacted at capture time.
 *
 * The ZIP is deterministic (fixed timestamps, stable paths) and uploaded to
 * Vercel Blob, while the artifact row stores only non-secret metadata + URL.
 *
 * @param input - Run scope and identity.
 * @returns Artifact identity + blob URL + manifest.
 */
export async function createImplementationAuditBundleArtifact(
  input: Readonly<{ projectId: string; runId: string }>,
): Promise<ImplementationAuditBundleResult> {
  "use step";

  const uploaded = await buildAndUploadImplementationAuditBundle(input);
  const artifact = await createArtifactVersion({
    content: {
      blobPath: uploaded.blobPath,
      blobUrl: uploaded.blobUrl,
      bytes: uploaded.bytes,
      format: "zip",
      manifest: uploaded.manifest,
      sha256: uploaded.sha256,
    },
    kind: "IMPLEMENTATION_AUDIT_BUNDLE",
    logicalKey: `run:${input.runId}`,
    projectId: input.projectId,
    runId: input.runId,
  });

  await enqueueArtifactIndexing({
    artifactId: artifact.id,
    kind: artifact.kind,
    logicalKey: artifact.logicalKey,
    projectId: artifact.projectId,
    version: artifact.version,
  });

  return {
    artifactId: artifact.id,
    blobUrl: uploaded.blobUrl,
    bytes: uploaded.bytes,
    manifest: uploaded.manifest,
    sha256: uploaded.sha256,
    version: artifact.version,
  };
}
