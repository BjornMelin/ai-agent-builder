import { del } from "@vercel/blob";
import { revalidateTag } from "next/cache";
import type { NextResponse } from "next/server";
import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { tagUploadsIndex } from "@/lib/cache/tags";
import { budgets } from "@/lib/config/budgets.server";
import { AppError, type JsonError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
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

function parseContentLengthHeader(res: Response): number | null {
  const raw = res.headers.get("content-length");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

async function readResponseBytesWithLimit(
  res: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  // Prefer streaming to avoid buffering unexpected response sizes.
  const reader = res.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new AppError(
        "file_too_large",
        413,
        `File too large (max ${maxBytes} bytes).`,
      );
    }
    return bytes;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // Best-effort cancel; size enforcement is the important part.
      }
      throw new AppError(
        "file_too_large",
        413,
        `File too large (max ${maxBytes} bytes).`,
      );
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(items.length);
  let index = 0;

  const worker = async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await fn(items[current] as T);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

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
 * @throws AppError - Thrown when authorization, validation, blob fetch, or ingestion fails.
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

    let didMutateFilesIndex = false;
    const results = await mapWithConcurrency(
      parsed.blobs,
      2,
      async (
        blob,
      ): Promise<
        ProjectFileDto & Readonly<{ ingest?: { chunksIndexed: number } }>
      > => {
        const contentType = blob.contentType.trim();
        if (!allowedUploadMimeTypeSet.has(contentType)) {
          throw new AppError(
            "unsupported_file_type",
            400,
            `Unsupported file type: ${contentType}`,
          );
        }

        // Defense-in-depth. The real size is validated after fetch (and streamed
        // with an explicit max byte limit), but this can reject obviously invalid
        // requests early.
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

        const contentLength = parseContentLengthHeader(res);
        if (contentLength !== null && contentLength > budgets.maxUploadBytes) {
          throw new AppError(
            "file_too_large",
            413,
            `File too large (max ${budgets.maxUploadBytes} bytes).`,
          );
        }

        let bytes: Uint8Array;
        try {
          bytes = await readResponseBytesWithLimit(res, budgets.maxUploadBytes);
        } catch (err) {
          if (err instanceof AppError) {
            throw err;
          }
          throw new AppError(
            "blob_fetch_failed",
            502,
            "Failed to read blob.",
            err,
          );
        }
        if (bytes.byteLength > budgets.maxUploadBytes) {
          throw new AppError(
            "file_too_large",
            413,
            `File too large (max ${budgets.maxUploadBytes} bytes).`,
          );
        }

        const sha256 = sha256Hex(bytes);

        const existing = await getProjectFileBySha256(parsed.projectId, sha256);
        if (existing) {
          // Only clean up when this register call refers to an extra duplicate blob.
          // If the URL matches the canonical stored key, deleting would break the DB reference.
          if (existing.storageKey !== blob.url) {
            await deleteUploadedBlob(blob.url);
          }
          return existing;
        }

        const safeName = sanitizeFilename(blob.originalName);
        didMutateFilesIndex = true;
        const dbFile = await upsertProjectFile({
          mimeType: contentType,
          name: safeName,
          projectId: parsed.projectId,
          sha256,
          sizeBytes: bytes.byteLength,
          storageKey: blob.url,
        });

        // Concurrency safety: if another task registered the same sha256 first,
        // ensure we return the canonical DB row and clean up our extra blob.
        const canonical = await getProjectFileBySha256(
          parsed.projectId,
          sha256,
        );
        const resolved = canonical ?? dbFile;
        if (resolved.storageKey !== blob.url) {
          await deleteUploadedBlob(blob.url);
        }

        if (shouldIngestAsync) {
          try {
            const qstash = getQstashClient();
            const origin = env.app.baseUrl;

            await qstash.publishJSON({
              body: { fileId: resolved.id, projectId: parsed.projectId },
              deduplicationId: `ingest:${resolved.id}`,
              label: "ingest-file",
              url: `${origin}/api/jobs/ingest-file`,
            });

            return resolved;
          } catch (err) {
            if (env.runtime.isVercel) {
              throw err;
            }
            const errForLog =
              err instanceof Error
                ? {
                    name: err.name,
                    ...(typeof (err as unknown as { code?: unknown }).code ===
                    "string"
                      ? { code: (err as unknown as { code: string }).code }
                      : {}),
                  }
                : { kind: typeof err };

            // Non-Vercel runs intentionally fall back to inline ingestion.
            // Still log at warn-level in production so self-hosted deployments
            // don't silently lose async ingestion.
            if (process.env.NODE_ENV === "production") {
              log.warn("upload_register_qstash_unavailable_falling_back", {
                err: errForLog,
              });
            } else {
              log.debug("upload_register_qstash_unavailable_falling_back", {
                err: errForLog,
              });
            }
          }
        }

        const ingest = await ingestFile({
          bytes,
          fileId: resolved.id,
          mimeType: contentType,
          name: safeName,
          projectId: parsed.projectId,
        });

        return {
          ...resolved,
          ingest: { chunksIndexed: ingest.chunksIndexed },
        };
      },
    );

    if (didMutateFilesIndex) {
      revalidateTag(tagUploadsIndex(parsed.projectId), "max");
    }
    return jsonOk({ files: results });
  } catch (err) {
    return jsonError(err);
  }
}
