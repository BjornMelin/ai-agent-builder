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
import { getRequestOrigin } from "@/lib/next/request-origin";
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

type UploadResponse = Readonly<{
  files: readonly (ProjectFileDto &
    Readonly<{ ingest?: { chunksIndexed: number } }>)[]; // JSON-safe
}>;

/**
 * Upload one or more files to a project, optionally ingesting them.
 *
 * @param req - HTTP request.
 * @returns Upload response.
 */
export async function POST(
  req: Request,
): Promise<NextResponse<UploadResponse | JsonError>> {
  try {
    await requireAppUserApi();

    const form = await req.formData();
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

    const results: (ProjectFileDto &
      Readonly<{ ingest?: { chunksIndexed: number } }>)[] = [];

    for (const file of files) {
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
        results.push(existing);
        continue;
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
          const origin = getRequestOrigin(req.headers);
          if (!origin) {
            throw new AppError(
              "bad_request",
              400,
              "Unable to determine request origin for async ingestion.",
            );
          }

          await qstash.publishJSON({
            body: { fileId: dbFile.id, projectId },
            url: `${origin}/api/jobs/ingest-file`,
          });

          results.push(dbFile);
          continue;
        } catch (err) {
          // If QStash isn't configured, fall through to inline ingestion.
          // This keeps local development usable without tunneling.
          if (env.runtime.isVercel) {
            throw err;
          }
        }
      }

      const ingest = await ingestFile({
        bytes,
        fileId: dbFile.id,
        mimeType,
        name: safeName,
        projectId,
      });

      results.push({
        ...dbFile,
        ingest: { chunksIndexed: ingest.chunksIndexed },
      });
    }

    return jsonOk({ files: results });
  } catch (err) {
    return jsonError(err);
  }
}
