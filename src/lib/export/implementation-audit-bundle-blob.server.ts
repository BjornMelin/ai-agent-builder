import "server-only";

import { put } from "@vercel/blob";

import { env } from "@/lib/env";

/**
 * Build the canonical blob path for an implementation audit bundle ZIP.
 *
 * @param input - Audit bundle identity.
 * @returns Blob path (not a URL).
 */
export function getImplementationAuditBundleBlobPath(
  input: Readonly<{ projectId: string; runId: string }>,
): string {
  return `projects/${input.projectId}/runs/${input.runId}/audit/implementation-audit-bundle.zip`;
}

/**
 * Persist an implementation audit bundle ZIP to Vercel Blob.
 *
 * @param input - Blob path and ZIP bytes.
 * @returns Public blob URL.
 */
export async function putImplementationAuditBundleBlob(
  input: Readonly<{ blobPath: string; bytes: Uint8Array }>,
): Promise<string> {
  const blob = await put(input.blobPath, Buffer.from(input.bytes), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/zip",
    token: env.blob.readWriteToken,
  });

  return blob.url;
}
