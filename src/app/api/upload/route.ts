import { put } from "@vercel/blob";
import type { NextResponse } from "next/server";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError, type JsonError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import {
  getProjectFileBySha256,
  type ProjectFileDto,
  upsertProjectFile,
} from "@/lib/data/files.server";
import { getProjectById } from "@/lib/data/projects.server";
import { env } from "@/lib/env";
import { ingestFile } from "@/lib/ingest/ingest-file.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { getQstashClient } from "@/lib/upstash/qstash.server";

const allowedMimeTypes = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
]);

function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "upload";
  return trimmed.replaceAll(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 128);
}

/**
 * Response payload for the upload endpoint.
 *
 * Contains a JSON-safe readonly array of ProjectFileDto values, each optionally
 * extended with ingestion metadata (`ingest.chunksIndexed`).
 */
type UploadResponse = Readonly<{
  files: readonly (ProjectFileDto &
    Readonly<{ ingest?: { chunksIndexed: number } }>)[]; // JSON-safe
}>;

/**
 * Upload one or more files to a project, optionally ingesting them.
 *
 * @param req - Authenticated multipart/form-data request containing projectId, file(s), and optional async flag; files must be within size limits and supported MIME types.
 * @returns JSON response with uploaded file metadata and optional ingestion results (chunk counts when ingested).
 * @throws AppError - When authentication fails, inputs are invalid, or upload/ingest operations fail.
 */
export async function POST(
  req: Request,
): Promise<NextResponse<UploadResponse | JsonError>> {
  try {
    const authPromise = requireAppUserApi();
    const formPromise = req.formData().catch(() => null);
    await authPromise;

    const form = await formPromise;
    if (!form) {
      throw new AppError("bad_request", 400, "Invalid form data.");
    }
    const projectId = String(form.get("projectId") ?? "").trim();

    if (!projectId) {
      throw new AppError("bad_request", 400, "Missing projectId.");
    }

    const project = await getProjectById(projectId);
    if (!project) {
      throw new AppError("not_found", 404, "Project not found.");
    }

    const files = form
      .getAll("file")
      .filter((v): v is File => v instanceof File);
    if (files.length === 0) {
      throw new AppError("bad_request", 400, "Missing file.");
    }

    const shouldIngestAsync =
      String(form.get("async") ?? "")
        .trim()
        .toLowerCase() === "true";

    const results = await Promise.all(
      files.map(
        async (
          file,
        ): Promise<
          ProjectFileDto & Readonly<{ ingest?: { chunksIndexed: number } }>
        > => {
          const sizeBytes = file.size;
          if (sizeBytes > budgets.maxUploadBytes) {
            throw new AppError(
              "file_too_large",
              413,
              `File too large (max ${budgets.maxUploadBytes} bytes).`,
            );
          }

          const mimeType = file.type || "application/octet-stream";
          if (!allowedMimeTypes.has(mimeType)) {
            throw new AppError(
              "unsupported_file_type",
              400,
              `Unsupported file type: ${mimeType}`,
            );
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          const sha256 = sha256Hex(bytes);

          const existing = await getProjectFileBySha256(projectId, sha256);
          if (existing) {
            return existing;
          }

          const safeName = sanitizeFilename(file.name);
          const blobPath = `projects/${projectId}/uploads/${sha256}-${safeName}`;

          const blob = await put(blobPath, file, {
            access: "public",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: mimeType,
            token: env.blob.readWriteToken,
          });

          const dbFile = await upsertProjectFile({
            mimeType,
            name: safeName,
            projectId,
            sha256,
            sizeBytes,
            storageKey: blob.url,
          });

          // Prefer QStash for heavier ingestion; fall back to inline when not configured.
          if (shouldIngestAsync) {
            try {
              const qstash = getQstashClient();
              const origin = env.app.baseUrl;

              await qstash.publishJSON({
                body: { fileId: dbFile.id, projectId },
                deduplicationId: `ingest:${dbFile.id}`,
                label: "ingest-file",
                url: `${origin}/api/jobs/ingest-file`,
              });

              return dbFile;
            } catch (err) {
              // If QStash isn't configured, fall through to inline ingestion.
              // This keeps local development usable without tunneling.
              if (env.runtime.isVercel) {
                throw err;
              }
              console.debug(
                "[upload] QStash unavailable, falling back to inline ingestion",
                err,
              );
            }
          }

          const ingest = await ingestFile({
            bytes,
            fileId: dbFile.id,
            mimeType,
            name: safeName,
            projectId,
          });

          return {
            ...dbFile,
            ingest: { chunksIndexed: ingest.chunksIndexed },
          };
        },
      ),
    );

    return jsonOk({ files: results });
  } catch (err) {
    return jsonError(err);
  }
}
