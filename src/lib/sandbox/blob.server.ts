import "server-only";

import { put } from "@vercel/blob";

import { env } from "@/lib/env";

/**
 * Build the canonical blob path for a sandbox transcript.
 *
 * @param input - Transcript identity.
 * @returns Blob path (not a URL).
 */
export function getSandboxTranscriptBlobPath(
  input: Readonly<{
    projectId: string;
    runId: string;
    jobId: string;
  }>,
): string {
  return `projects/${input.projectId}/runs/${input.runId}/sandbox/${input.jobId}.log`;
}

/**
 * Persist a sandbox transcript to Vercel Blob.
 *
 * @param input - Transcript payload.
 * @returns Public blob URL.
 */
export async function putSandboxTranscriptBlob(
  input: Readonly<{
    blobPath: string;
    content: string;
  }>,
): Promise<string> {
  const blob = await put(input.blobPath, input.content, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "text/plain; charset=utf-8",
    token: env.blob.readWriteToken,
  });

  return blob.url;
}
