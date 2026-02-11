import { del } from "@vercel/blob";
import { revalidateTag } from "next/cache";
import type { NextResponse } from "next/server";
import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { tagUploadsIndex } from "@/lib/cache/tags";
import { budgets } from "@/lib/config/budgets.server";
import { AppError, type JsonError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import {
  getProjectFileBySha256,
  type ProjectFileDto,
  upsertProjectFile,
} from "@/lib/data/files.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { env } from "@/lib/env";
import { ingestFile } from "@/lib/ingest/ingest-file.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { allowedUploadMimeTypeSet } from "@/lib/uploads/allowed-mime-types";
import { sanitizeFilename } from "@/lib/uploads/filename";
import { parseTrustedProjectUploadBlobUrl } from "@/lib/uploads/trusted-blob-url.server";
import { getQstashClient } from "@/lib/upstash/qstash.server";

const blobSchema = z.strictObject({
  contentType: z.string().min(1),
  originalName: z.string().min(1),
  size: z.number().int().positive(),
  url: z.string().min(1),
});

const bodySchema = z.strictObject({
  async: z.boolean().optional(),
  blobs: z.array(blobSchema).min(1),
  projectId: z.string().min(1),
});

/**
 * Response payload for upload registration.
 *
 * Contains a JSON-safe readonly array of ProjectFileDto values, each optionally
 * extended with ingestion metadata (`ingest.chunksIndexed`).
 */
type RegisterUploadResponse = Readonly<{
  files: readonly (ProjectFileDto &
    Readonly<{ ingest?: { chunksIndexed: number } }>)[]; // JSON-safe
}>;

async function deleteUploadedBlob(url: string): Promise<void> {
  try {
    await del(url, { token: env.blob.readWriteToken });
  } catch {
    // Best effort: storage cleanup should not block user-facing flows.
  }
}

/**
 * Register one or more already-uploaded Vercel Blob objects with the project.
 *
 * @remarks
 * This endpoint is used after `@vercel/blob/client upload()` completes.
 * It performs project authorization, validates blob URLs, persists file
 * metadata in the database (idempotent by sha256), and optionally ingests.
 *
 * @param req - HTTP request.
 * @returns JSON response with registered file metadata.
 */
export async function POST(
  req: Request,
): Promise<NextResponse<RegisterUploadResponse | JsonError>> {
  try {
    const authPromise = requireAppUserApi();
    const bodyPromise = parseJsonBody(req, bodySchema);
    const [user, parsed] = await Promise.all([authPromise, bodyPromise]);

    const project = await getProjectByIdForUser(parsed.projectId, user.id);
    if (!project) {
      throw new AppError("not_found", 404, "Project not found.");
    }

    const shouldIngestAsync = parsed.async === true;

    const results: (ProjectFileDto &
      Readonly<{ ingest?: { chunksIndexed: number } }>)[] = [];

    for (const blob of parsed.blobs) {
      const contentType = blob.contentType.trim();
      if (!allowedUploadMimeTypeSet.has(contentType)) {
        throw new AppError(
          "unsupported_file_type",
          400,
          `Unsupported file type: ${contentType}`,
        );
      }

      if (blob.size > budgets.maxUploadBytes) {
        throw new AppError(
          "file_too_large",
          413,
          `File too large (max ${budgets.maxUploadBytes} bytes).`,
        );
      }

      const blobUrl = parseTrustedProjectUploadBlobUrl({
        projectId: parsed.projectId,
        urlString: blob.url,
      });

      let res: Response;
      try {
        res = await fetch(blobUrl.toString(), {
          signal: AbortSignal.timeout(60_000),
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
      const sha256 = sha256Hex(bytes);

      const existing = await getProjectFileBySha256(parsed.projectId, sha256);
      if (existing) {
        await deleteUploadedBlob(blob.url);
        results.push(existing);
        continue;
      }

      const safeName = sanitizeFilename(blob.originalName);
      const dbFile = await upsertProjectFile({
        mimeType: contentType,
        name: safeName,
        projectId: parsed.projectId,
        sha256,
        sizeBytes: bytes.byteLength,
        storageKey: blob.url,
      });
      revalidateTag(tagUploadsIndex(parsed.projectId), "max");

      if (shouldIngestAsync) {
        try {
          const qstash = getQstashClient();
          const origin = env.app.baseUrl;

          await qstash.publishJSON({
            body: { fileId: dbFile.id, projectId: parsed.projectId },
            deduplicationId: `ingest:${dbFile.id}`,
            label: "ingest-file",
            url: `${origin}/api/jobs/ingest-file`,
          });

          results.push(dbFile);
          continue;
        } catch (err) {
          if (env.runtime.isVercel) {
            throw err;
          }
          console.debug(
            "[upload/register] QStash unavailable, falling back to inline ingestion",
            err,
          );
        }
      }

      const ingest = await ingestFile({
        bytes,
        fileId: dbFile.id,
        mimeType: contentType,
        name: safeName,
        projectId: parsed.projectId,
      });
      revalidateTag(tagUploadsIndex(parsed.projectId), "max");

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
