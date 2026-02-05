import "server-only";

import { Readable } from "node:stream";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";

type ZipCompression = "DEFLATE";

const FIXED_DATE = new Date(0);
const COMPRESSION: ZipCompression = "DEFLATE";
const COMPRESSION_LEVEL = 6;
const RESERVED_EXPORT_PATHS = new Set(["manifest.json"]);

/**
 * A single file entry in an export bundle.
 */
export type ExportEntry = Readonly<{
  path: string;
  sha256: string;
  bytes: number;
}>;

/**
 * Deterministic export manifest.
 */
export type ExportManifest = Readonly<{
  version: 1;
  project: Readonly<{ id: string; slug: string; name: string }>;
  entries: readonly ExportEntry[];
}>;

type ExportFileInput = Readonly<{
  path: string;
  contentBytes: Uint8Array;
}>;

function sanitizeSegment(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "artifact";

  const sanitized = trimmed.replaceAll(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 128);
  if (sanitized.length === 0) return "artifact";
  if (sanitized === ".") return "_dot";
  if (sanitized === "..") return "_dotdot";
  return sanitized;
}

function sanitizeZipPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "artifact";

  const unix = trimmed.replaceAll(/\\/g, "/").replace(/^[a-zA-Z]:/, "");
  const withoutLeadingSlash = unix.replace(/^\/+/, "");

  const segments = withoutLeadingSlash
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => sanitizeSegment(segment));

  return segments.length > 0 ? segments.join("/") : "artifact";
}

function sanitizeFileInputs(
  files: readonly ExportFileInput[],
): ExportFileInput[] {
  const seen = new Set<string>();
  const sanitized: ExportFileInput[] = [];

  for (const file of files) {
    const safePath = sanitizeZipPath(file.path);
    if (RESERVED_EXPORT_PATHS.has(safePath)) {
      throw new AppError(
        "export_path_conflict",
        500,
        "Export path conflicts with a reserved ZIP entry name.",
        { path: safePath },
      );
    }
    if (seen.has(safePath)) {
      throw new AppError(
        "export_path_conflict",
        500,
        "Export contains duplicate ZIP entry paths after sanitization.",
        { path: safePath },
      );
    }
    seen.add(safePath);
    sanitized.push({ contentBytes: file.contentBytes, path: safePath });
  }

  return sanitized;
}

function toUtf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function buildManifest(
  project: ExportManifest["project"],
  files: readonly ExportFileInput[],
): ExportManifest {
  const entries: ExportEntry[] = files
    .map((f) => ({
      bytes: f.contentBytes.byteLength,
      path: f.path,
      sha256: sha256Hex(f.contentBytes),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    entries,
    project,
    version: 1,
  };
}

async function createZip(files: readonly ExportFileInput[]) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sorted) {
    zip.file(file.path, file.contentBytes, {
      compression: COMPRESSION,
      createFolders: false,
      date: FIXED_DATE,
    });
  }

  return zip;
}

function prepareZipInputs(
  input: Readonly<{
    project: ExportManifest["project"];
    files: readonly ExportFileInput[];
  }>,
): Readonly<{
  manifest: ExportManifest;
  zipFiles: readonly ExportFileInput[];
}> {
  const sanitizedFiles = sanitizeFileInputs(input.files);
  const manifest = buildManifest(input.project, sanitizedFiles);
  const manifestBytes = toUtf8Bytes(`${JSON.stringify(manifest, null, 2)}\n`);

  const zipFiles: ExportFileInput[] = [
    ...sanitizedFiles,
    { contentBytes: manifestBytes, path: "manifest.json" },
  ];

  return { manifest, zipFiles };
}

/**
 * Build the deterministic export ZIP bytes.
 *
 * @param input - Bundle inputs.
 * @returns ZIP bytes and manifest.
 */
export async function buildExportZipBytes(
  input: Readonly<{
    project: ExportManifest["project"];
    files: readonly ExportFileInput[];
  }>,
): Promise<Readonly<{ bytes: Uint8Array; manifest: ExportManifest }>> {
  const { manifest, zipFiles } = prepareZipInputs(input);
  const zip = await createZip(zipFiles);

  const bytes = await zip.generateAsync({
    compression: COMPRESSION,
    compressionOptions: { level: COMPRESSION_LEVEL },
    streamFiles: true,
    type: "uint8array",
  });

  return { bytes, manifest };
}

/**
 * Build the deterministic export ZIP as a streaming response body.
 *
 * @param input - Bundle inputs.
 * @returns Web ReadableStream and manifest.
 */
export async function buildExportZipStream(
  input: Readonly<{
    project: ExportManifest["project"];
    files: readonly ExportFileInput[];
  }>,
): Promise<
  Readonly<{ stream: ReadableStream<Uint8Array>; manifest: ExportManifest }>
> {
  const { manifest, zipFiles } = prepareZipInputs(input);
  const zip = await createZip(zipFiles);

  const nodeStream = zip.generateNodeStream({
    compression: COMPRESSION,
    compressionOptions: { level: COMPRESSION_LEVEL },
    streamFiles: true,
  });

  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  return { manifest, stream: webStream };
}

/**
 * Convenience helper to build the export paths for an artifact.
 *
 * @param input - Artifact identity:
 *   - `kind`: Artifact kind segment (sanitized).
 *   - `logicalKey`: Artifact logical key segment (sanitized).
 *   - `version`: Artifact version suffix used in the deterministic path.
 * @returns Deterministic artifact file path prefix.
 */
export function artifactExportBasePath(
  input: Readonly<{ kind: string; logicalKey: string; version: number }>,
): string {
  const safeKind = sanitizeSegment(input.kind);
  const safeKey = sanitizeSegment(input.logicalKey);
  return `${safeKind}/${safeKey}.v${input.version}`;
}
