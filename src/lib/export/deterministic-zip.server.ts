import "server-only";

import { Readable } from "node:stream";

import { sha256Hex } from "@/lib/core/sha256";

type ZipCompression = "DEFLATE";

const FIXED_DATE = new Date(0);
const COMPRESSION: ZipCompression = "DEFLATE";
const COMPRESSION_LEVEL = 6;

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
  return trimmed.replaceAll(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 128);
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
      date: FIXED_DATE,
    });
  }

  return zip;
}

/**
 * Build the deterministic export ZIP bytes.
 *
 * @param input - Bundle inputs.
 * @returns ZIP bytes and manifest.
 */
export async function buildDeterministicZipBytes(
  input: Readonly<{
    project: ExportManifest["project"];
    files: readonly ExportFileInput[];
  }>,
): Promise<Readonly<{ bytes: Uint8Array; manifest: ExportManifest }>> {
  const manifest = buildManifest(input.project, input.files);
  const manifestBytes = toUtf8Bytes(`${JSON.stringify(manifest, null, 2)}\n`);

  const files: ExportFileInput[] = [
    ...input.files,
    { contentBytes: manifestBytes, path: "manifest.json" },
  ].map((f) => ({
    contentBytes: f.contentBytes,
    path: f.path
      .split("/")
      .map((s) => sanitizeSegment(s))
      .join("/"),
  }));

  const zip = await createZip(files);

  const bytes = await zip.generateAsync({
    compression: COMPRESSION,
    compressionOptions: { level: COMPRESSION_LEVEL },
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
export async function buildDeterministicZipStream(
  input: Readonly<{
    project: ExportManifest["project"];
    files: readonly ExportFileInput[];
  }>,
): Promise<
  Readonly<{ stream: ReadableStream<Uint8Array>; manifest: ExportManifest }>
> {
  const manifest = buildManifest(input.project, input.files);
  const manifestBytes = toUtf8Bytes(`${JSON.stringify(manifest, null, 2)}\n`);

  const files: ExportFileInput[] = [
    ...input.files,
    { contentBytes: manifestBytes, path: "manifest.json" },
  ].map((f) => ({
    contentBytes: f.contentBytes,
    path: f.path
      .split("/")
      .map((s) => sanitizeSegment(s))
      .join("/"),
  }));

  const zip = await createZip(files);

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
 * @param input - Artifact identity.
 * @returns Deterministic artifact file path prefix.
 */
export function artifactExportBasePath(
  input: Readonly<{ kind: string; logicalKey: string; version: number }>,
): string {
  const safeKind = sanitizeSegment(input.kind);
  const safeKey = sanitizeSegment(input.logicalKey);
  return `${safeKind}/${safeKey}.v${input.version}`;
}
