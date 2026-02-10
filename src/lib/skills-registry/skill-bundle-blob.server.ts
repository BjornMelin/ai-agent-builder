import "server-only";

import { put } from "@vercel/blob";

import { env } from "@/lib/env";

/**
 * Build the canonical blob path prefix for a project skill bundle ZIP.
 *
 * @param input - Project+skill identity.
 * @returns Blob path (not a URL).
 */
export function getProjectSkillBundleBlobPath(
  input: Readonly<{ projectId: string; skillName: string }>,
): string {
  return `projects/${input.projectId}/skills/${input.skillName}/bundles/skill-bundle.zip`;
}

/**
 * Persist a project skill bundle ZIP to Vercel Blob.
 *
 * @param input - Blob path and ZIP bytes.
 * @returns Uploaded blob pathname.
 */
export async function putProjectSkillBundleBlob(
  input: Readonly<{ blobPath: string; bytes: Uint8Array }>,
): Promise<string> {
  const blob = await put(input.blobPath, Buffer.from(input.bytes), {
    access: "public",
    addRandomSuffix: true,
    contentType: "application/zip",
    token: env.blob.readWriteToken,
  });

  // Note: Vercel Blob currently supports public access only. Treat this
  // pathname as sensitive metadata and avoid exposing it to untrusted clients.
  return blob.pathname;
}
