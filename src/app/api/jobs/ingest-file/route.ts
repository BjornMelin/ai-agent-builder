import { revalidateTag } from "next/cache";
import { z } from "zod";
import { tagUploadsIndex } from "@/lib/cache/tags";
import { AppError } from "@/lib/core/errors";
import {
  getProjectFileById,
  type ProjectFileDto,
} from "@/lib/data/files.server";
import { ingestFile } from "@/lib/ingest/ingest-file.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { verifyQstashSignatureAppRouter } from "@/lib/upstash/qstash.server";

const bodySchema = z.strictObject({
  fileId: z.string().min(1),
  projectId: z.string().min(1),
});
const TRUSTED_BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new AppError(
      "blob_fetch_failed",
      502,
      "Invalid blob storage URL encoding.",
    );
  }
}

function extractRawPathname(urlString: string): string {
  const schemeIndex = urlString.indexOf("://");
  if (schemeIndex === -1) {
    return "/";
  }

  const pathStart = urlString.indexOf("/", schemeIndex + 3);
  if (pathStart === -1) {
    return "/";
  }

  const queryIndex = urlString.indexOf("?", pathStart);
  const hashIndex = urlString.indexOf("#", pathStart);

  let end = urlString.length;
  if (queryIndex !== -1) {
    end = Math.min(end, queryIndex);
  }
  if (hashIndex !== -1) {
    end = Math.min(end, hashIndex);
  }

  return urlString.slice(pathStart, end);
}

function assertNoPathTraversal(rawPathname: string): void {
  const segments = rawPathname.split("/").map(decodePathSegment);

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new AppError(
        "blob_fetch_failed",
        502,
        "Invalid blob storage path.",
      );
    }
  }
}

function parseTrustedBlobUrl(file: ProjectFileDto, projectId: string): URL {
  // Block traversal attempts before URL parsing/normalization so poisoned storage
  // keys like `/uploads/../...` or `/uploads/%2e%2e/...` can't be interpreted as
  // a different object by downstream fetchers.
  assertNoPathTraversal(extractRawPathname(file.storageKey));

  let url: URL;
  try {
    url = new URL(file.storageKey);
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

  // Do not trust `pathname.startsWith(...)` alone; dot-segments and encoded path
  // separators can be used to bypass prefix checks in downstream fetchers.
  // Require the known upload format:
  // `/projects/${projectId}/uploads/${sha256}-...` with no extra path segments.
  const segments = url.pathname.split("/").map(decodePathSegment);
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new AppError(
        "blob_fetch_failed",
        502,
        "Invalid blob storage path.",
      );
    }
    if (segment.includes("/") || segment.includes("\\")) {
      throw new AppError(
        "blob_fetch_failed",
        502,
        "Invalid blob storage path.",
      );
    }
  }

  if (
    segments.length !== 5 ||
    segments[0] !== "" ||
    segments[1] !== "projects" ||
    segments[2] !== projectId ||
    segments[3] !== "uploads"
  ) {
    throw new AppError("blob_fetch_failed", 502, "Blob path/project mismatch.");
  }

  const objectKey = segments[4];
  if (!objectKey) {
    throw new AppError("blob_fetch_failed", 502, "Invalid blob storage path.");
  }
  if (!objectKey.startsWith(`${file.sha256}-`)) {
    throw new AppError("blob_fetch_failed", 502, "Blob path/file mismatch.");
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
    const file = await getProjectFileById(fileId, projectId);
    if (!file || file.projectId !== projectId) {
      throw new AppError("not_found", 404, "File not found.");
    }
    const blobUrl = parseTrustedBlobUrl(file, projectId);

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
