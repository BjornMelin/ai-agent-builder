import "server-only";

import { head } from "@vercel/blob";
import JSZip from "jszip";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/net/fetch-with-timeout.server";

const MAX_BUNDLE_ZIP_BYTES = 5_000_000;
const MAX_SKILL_READ_FILE_BYTES = 128_000;
const MAX_BUNDLE_ZIP_FILE_COUNT = 1_000;

function assertRelativePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError("bad_request", 400, "Invalid path.");
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("~")) {
    throw new AppError("bad_request", 400, "Path must be relative.");
  }
  if (/(^|[\\/])\.\.([\\/]|$)/.test(trimmed)) {
    throw new AppError("bad_request", 400, "Path traversal is not allowed.");
  }
  return trimmed;
}

function normalizeZipRelativePath(relativePath: string): string {
  // JSZip paths are POSIX-like.
  return relativePath
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
}

function assertUtf8Text(bytes: Uint8Array): void {
  // Heuristic: bundled skill resources should be text. Null bytes are a strong
  // signal the file is binary and should not be decoded for tool consumption.
  for (const b of bytes) {
    if (b === 0) {
      throw new AppError(
        "bad_request",
        400,
        "Skill file appears to be binary and cannot be read as text.",
      );
    }
  }
}

function readZipUncompressedSize(file: JSZip.JSZipObject): number | null {
  const dataUnknown = (file as unknown as { _data?: unknown })._data;
  if (!dataUnknown || typeof dataUnknown !== "object") return null;
  const size = (dataUnknown as Record<string, unknown>).uncompressedSize;
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    return null;
  }
  return size;
}

/**
 * Read a file from a bundled (ZIP) skill stored in Vercel Blob.
 *
 * @param input - Bundle reference and file path.
 * @returns UTF-8 file content.
 */
export async function readBundledSkillFileFromBlob(
  input: Readonly<{ blobPath: string; relativePath: string }>,
): Promise<string> {
  const relativePath = normalizeZipRelativePath(
    assertRelativePath(input.relativePath),
  );

  const metadata = await head(input.blobPath, {
    token: env.blob.readWriteToken,
  });
  if (metadata.size > MAX_BUNDLE_ZIP_BYTES) {
    throw new AppError(
      "bad_request",
      400,
      `Skill bundle exceeds maximum size (${MAX_BUNDLE_ZIP_BYTES} bytes).`,
    );
  }

  const res = await fetchWithTimeout(
    metadata.downloadUrl,
    { method: "GET" },
    { timeoutMs: 60_000 },
  );
  if (!res.ok) {
    throw new AppError(
      "upstream_failed",
      502,
      `Failed to download skill bundle (${res.status}).`,
    );
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const fileCount = Object.keys(zip.files).length;
  if (fileCount > MAX_BUNDLE_ZIP_FILE_COUNT) {
    throw new AppError(
      "bad_request",
      400,
      `Skill bundle exceeds maximum file count (${MAX_BUNDLE_ZIP_FILE_COUNT}).`,
    );
  }
  const file = zip.file(relativePath);
  if (!file) {
    throw new AppError(
      "not_found",
      404,
      `Skill file not found: ${relativePath}`,
    );
  }

  const uncompressed = readZipUncompressedSize(file);
  if (uncompressed !== null && uncompressed > MAX_SKILL_READ_FILE_BYTES) {
    throw new AppError(
      "bad_request",
      400,
      `Skill file exceeds maximum size (${MAX_SKILL_READ_FILE_BYTES} bytes).`,
    );
  }

  const bytes = await file.async("uint8array");
  if (bytes.byteLength > MAX_SKILL_READ_FILE_BYTES) {
    throw new AppError(
      "bad_request",
      400,
      `Skill file exceeds maximum size (${MAX_SKILL_READ_FILE_BYTES} bytes).`,
    );
  }

  assertUtf8Text(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}
