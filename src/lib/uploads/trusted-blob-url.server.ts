import "server-only";

import { AppError } from "@/lib/core/errors";

const TRUSTED_BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

type PathErrorSpec = Readonly<{
  code: string;
  message: string;
  status: number;
}>;

function throwPathError(spec: PathErrorSpec, cause?: unknown): never {
  throw new AppError(spec.code, spec.status, spec.message, cause);
}

function decodePathSegment(segment: string, spec: PathErrorSpec): string {
  try {
    return decodeURIComponent(segment);
  } catch (err) {
    throwPathError(spec, err);
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

function assertNoPathTraversal(
  rawPathname: string,
  encodingError: PathErrorSpec,
  invalidPathError: PathErrorSpec,
): void {
  const segments = rawPathname
    .split("/")
    .map((segment) => decodePathSegment(segment, encodingError));
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throwPathError(invalidPathError);
    }
    if (segment.includes("/") || segment.includes("\\")) {
      throwPathError(invalidPathError);
    }
  }
}

function normalizePathname(pathname: string): string {
  return pathname.startsWith("/") ? pathname.slice(1) : pathname;
}

function assertProjectUploadPathShape(
  input: Readonly<{ pathname: string; projectId: string }>,
  spec: Readonly<{
    encodingError: PathErrorSpec;
    invalidPathError: PathErrorSpec;
    mismatchError: PathErrorSpec;
  }>,
): void {
  const normalized = normalizePathname(input.pathname);

  // Validate traversal against the raw string before any URL normalization.
  assertNoPathTraversal(normalized, spec.encodingError, spec.invalidPathError);

  const segments = normalized
    .split("/")
    .map((segment) => decodePathSegment(segment, spec.encodingError));

  if (
    segments.length !== 4 ||
    segments[0] !== "projects" ||
    segments[1] !== input.projectId ||
    segments[2] !== "uploads" ||
    !segments[3]
  ) {
    throwPathError(spec.mismatchError);
  }
}

/**
 * Validate a project upload pathname for Vercel Blob token exchange.
 *
 * @remarks
 * This is used by the `/api/upload` token exchange route to ensure we only
 * mint tokens for upload paths that can later be registered by server-side
 * validation (`/projects/${projectId}/uploads/${objectKey}`).
 *
 * The validator:
 * - Requires exactly `projects/{projectId}/uploads/{objectKey}`.
 * - Decodes each segment (rejects invalid percent-encoding).
 * - Rejects `.` / `..` and decoded separators (`/` or `\\`) inside segments.
 *
 * @param input - Upload pathname (no host) and expected projectId.
 * @throws AppError - With code "bad_request" when validation fails.
 */
export function assertValidProjectUploadPathname(
  input: Readonly<{ pathname: string; projectId: string }>,
): void {
  assertProjectUploadPathShape(input, {
    encodingError: {
      code: "bad_request",
      message: "Invalid upload path.",
      status: 400,
    },
    invalidPathError: {
      code: "bad_request",
      message: "Invalid upload path.",
      status: 400,
    },
    mismatchError: {
      code: "bad_request",
      message: "Invalid upload path.",
      status: 400,
    },
  });
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
  assertNoPathTraversal(
    extractRawPathname(input.urlString),
    {
      code: "blob_fetch_failed",
      message: "Invalid blob storage URL encoding.",
      status: 502,
    },
    {
      code: "blob_fetch_failed",
      message: "Invalid blob storage path.",
      status: 502,
    },
  );

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

  assertProjectUploadPathShape(
    { pathname: url.pathname, projectId: input.projectId },
    {
      encodingError: {
        code: "blob_fetch_failed",
        message: "Invalid blob storage URL encoding.",
        status: 502,
      },
      invalidPathError: {
        code: "blob_fetch_failed",
        message: "Invalid blob storage path.",
        status: 502,
      },
      mismatchError: {
        code: "blob_fetch_failed",
        message: "Blob path/project mismatch.",
        status: 502,
      },
    },
  );

  return url;
}
