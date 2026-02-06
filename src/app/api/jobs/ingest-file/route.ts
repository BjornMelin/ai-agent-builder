import { revalidateTag } from "next/cache";
import { z } from "zod";
import { tagUploadsIndex } from "@/lib/cache/tags";
import { AppError } from "@/lib/core/errors";
import { getProjectFileById } from "@/lib/data/files.server";
import { ingestFile } from "@/lib/ingest/ingest-file.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { verifyQstashSignatureAppRouter } from "@/lib/upstash/qstash.server";

const bodySchema = z.strictObject({
  fileId: z.string().min(1),
  projectId: z.string().min(1),
});
const TRUSTED_BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

function parseTrustedBlobUrl(storageKey: string, projectId: string): URL {
  let url: URL;
  try {
    url = new URL(storageKey);
  } catch {
    throw new AppError(
      "blob_fetch_failed",
      502,
      "Invalid blob storage URL format.",
    );
  }

  if (url.protocol !== "https:") {
    throw new AppError("blob_fetch_failed", 502, "Invalid blob URL protocol.");
  }

  if (
    url.hostname !== "blob.vercel-storage.com" &&
    !url.hostname.endsWith(TRUSTED_BLOB_HOST_SUFFIX)
  ) {
    throw new AppError(
      "blob_fetch_failed",
      502,
      "Untrusted blob storage host.",
    );
  }

  const expectedPrefix = `/projects/${projectId}/uploads/`;
  if (!url.pathname.startsWith(expectedPrefix)) {
    throw new AppError("blob_fetch_failed", 502, "Blob path/project mismatch.");
  }

  return url;
}

/**
 * Ingest a file: extract, chunk, embed, and index its content.
 *
 * @remarks
 * This route is protected by QStash signature verification and is intended
 * to be called asynchronously via QStash for larger file processing.
 *
 * @param req - HTTP request containing fileId and projectId in JSON body.
 * @returns JSON response with ingestion result or error.
 * @throws AppError - When JSON body is malformed (400).
 * @throws AppError - When request body validation fails (400).
 * @throws AppError - When file is not found or project mismatch (404).
 * @throws AppError - When blob fetch fails (502).
 */
export const POST = verifyQstashSignatureAppRouter(async (req: Request) => {
  try {
    const { fileId, projectId } = await parseJsonBody(req, bodySchema);
    const file = await getProjectFileById(fileId);
    if (!file || file.projectId !== projectId) {
      throw new AppError("not_found", 404, "File not found.");
    }
    const blobUrl = parseTrustedBlobUrl(file.storageKey, projectId);

    let res: Response;
    try {
      res = await fetch(blobUrl.toString(), {
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "TimeoutError"
          ? "Blob fetch timed out."
          : "Failed to fetch blob.";
      throw new AppError("blob_fetch_failed", 502, message, err);
    }
    if (!res.ok) {
      throw new AppError(
        "blob_fetch_failed",
        502,
        `Failed to fetch blob (${res.status}).`,
      );
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    const result = await ingestFile({
      bytes,
      fileId,
      mimeType: file.mimeType,
      name: file.name,
      projectId,
    });
    revalidateTag(tagUploadsIndex(projectId), "max");

    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
});
