import "server-only";

import { enqueueArtifactIndexing } from "@/lib/artifacts/enqueue-indexing.server";
import { createArtifactVersion } from "@/lib/data/artifacts.server";

/**
 * Create a Code Mode summary artifact and enqueue indexing.
 *
 * @param input - Summary inputs.
 * @returns Created artifact id + version.
 */
export async function createCodeModeSummaryArtifact(
  input: Readonly<{
    projectId: string;
    runId: string;
    workflowRunId: string;
    prompt: string;
    assistantText: string;
    transcriptBlobRef: string | null;
  }>,
): Promise<Readonly<{ artifactId: string; version: number }>> {
  "use step";

  const transcriptLine = input.transcriptBlobRef
    ? `- Sandbox transcript: ${input.transcriptBlobRef}`
    : "- Sandbox transcript: (not available)";

  const markdown = [
    "**Code Mode summary**",
    "",
    `- Run: \`${input.runId}\``,
    `- Workflow: \`${input.workflowRunId}\``,
    transcriptLine,
    "",
    "## Prompt",
    "",
    input.prompt,
    "",
    "## Assistant output",
    "",
    input.assistantText.trim().length > 0 ? input.assistantText : "(empty)",
  ].join("\n");

  const artifact = await createArtifactVersion({
    content: {
      format: "markdown",
      markdown,
      title: `Code Mode ${input.runId}`,
    },
    kind: "CODE_MODE_SUMMARY",
    logicalKey: `code-mode:${input.runId}`,
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
