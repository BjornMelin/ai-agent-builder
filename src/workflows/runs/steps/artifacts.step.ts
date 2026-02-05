import "server-only";

import { enqueueArtifactIndexing } from "@/lib/artifacts/enqueue-indexing.server";
import { createArtifactVersion } from "@/lib/data/artifacts.server";

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
