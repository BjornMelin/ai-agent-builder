import "server-only";

import { AppError } from "@/lib/core/errors";

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
    if (segment.includes("/") || segment.includes("\\")) {
      throw new AppError(
        "blob_fetch_failed",
        502,
        "Invalid blob storage path.",
      );
    }
  }
}

/**
 * Parse and validate a public Vercel Blob URL for a project upload.
 *
 * @remarks
 * This is a defense-in-depth validation to prevent SSRF and path traversal.
 * It ensures the blob belongs to the expected project prefix:
 * `/projects/${projectId}/uploads/<objectKey>`.
 *
 * @param input - Blob URL string and projectId scope.
 * @returns A parsed URL object.
 * @throws AppError - With code "blob_fetch_failed" when validation fails.
 */
export function parseTrustedProjectUploadBlobUrl(
  input: Readonly<{ urlString: string; projectId: string }>,
): URL {
  // Validate traversal against the raw string before URL normalization.
  assertNoPathTraversal(extractRawPathname(input.urlString));

  let url: URL;
  try {
    url = new URL(input.urlString);
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

  const segments = url.pathname.split("/").map(decodePathSegment);
  if (
    segments.length !== 5 ||
    segments[0] !== "" ||
    segments[1] !== "projects" ||
    segments[2] !== input.projectId ||
    segments[3] !== "uploads" ||
    !segments[4]
  ) {
    throw new AppError("blob_fetch_failed", 502, "Blob path/project mismatch.");
  }

  return url;
}
