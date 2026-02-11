"use client";

import { upload } from "@vercel/blob/client";
import type { FileUIPart } from "ai";

import { tryReadJsonErrorMessage } from "@/lib/core/errors";
import { allowedUploadMimeTypeSet } from "@/lib/uploads/allowed-mime-types";
import { sanitizeFilename } from "@/lib/uploads/filename";

type RegisteredProjectFile = Readonly<{
  mimeType: string;
  name: string;
  storageKey: string;
}>;

function truncateForError(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}\u2026`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRegisterResponse(payload: unknown): RegisteredProjectFile[] {
  if (!payload || !isRecord(payload) || !Array.isArray(payload.files)) {
    throw new Error("Unexpected upload response.");
  }

  const out: RegisteredProjectFile[] = [];
  for (const item of payload.files) {
    if (!item || !isRecord(item)) {
      throw new Error("Unexpected upload response.");
    }
    const name = item.name;
    const mimeType = item.mimeType;
    const storageKey = item.storageKey;
    if (
      typeof name !== "string" ||
      typeof mimeType !== "string" ||
      typeof storageKey !== "string"
    ) {
      throw new Error("Unexpected upload response.");
    }
    out.push({ mimeType, name, storageKey });
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
  // Note: If one worker throws, Promise.all rejects while other in-flight workers
  // may still finish. In this upload flow, any orphaned blobs are tolerated
  // because the register route's SHA256 dedup prevents duplicate records on
  // re-upload. If we need stronger guarantees, add cooperative cancellation
  // (e.g. AbortSignal) and have `fn` honor it.
  await Promise.all(workers);
  return results;
}

/**
 * Upload and register attachments for a project.
 *
 * @remarks
 * Uses Vercel Blob client uploads for the data transfer, then calls
 * `POST /api/upload/register` to persist metadata and optionally ingest.
 *
 * @param input - Upload input.
 * @returns Hosted `FileUIPart[]` pointing at stored Blob URLs.
 * @throws Error - Thrown when a file has an unsupported MIME type.
 * @throws Error - Thrown when Vercel Blob upload or `POST /api/upload/register` fails.
 */
export async function uploadProjectFilesFromFiles(
  input: Readonly<{
    projectId: string;
    files: readonly File[];
    asyncIngest?: boolean | undefined;
  }>,
): Promise<FileUIPart[]> {
  if (input.files.length === 0) return [];

  for (const file of input.files) {
    const mimeType = file.type || "application/octet-stream";
    if (!allowedUploadMimeTypeSet.has(mimeType)) {
      const name = file.name?.trim() || "unnamed file";
      throw new Error(`Unsupported file type for "${name}": ${mimeType}`);
    }
  }

  const clientPayload = JSON.stringify({ projectId: input.projectId });

  const uploaded = await mapWithConcurrency(input.files, 2, async (file) => {
    const safeName = sanitizeFilename(file.name);
    const pathname = `projects/${input.projectId}/uploads/${safeName}`;
    const multipart = file.size >= 5 * 1024 * 1024;

    const blob = await upload(pathname, file, {
      access: "public",
      clientPayload,
      handleUploadUrl: "/api/upload",
      multipart,
    });

    return {
      contentType: file.type || blob.contentType || "application/octet-stream",
      originalName: file.name,
      size: file.size,
      url: blob.url,
    } as const;
  });

  const response = await fetch("/api/upload/register", {
    body: JSON.stringify({
      async: input.asyncIngest === true,
      blobs: uploaded,
      projectId: input.projectId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    const message =
      (await tryReadJsonErrorMessage(response)) ??
      "Failed to upload attachments.";
    throw new Error(message);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown JSON parse error.";
    throw new Error(
      `Failed to parse upload register response (malformed JSON): ${message}`,
    );
  }

  let registered: RegisteredProjectFile[];
  try {
    registered = parseRegisterResponse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    const payloadPreview = truncateForError(
      (() => {
        try {
          return JSON.stringify(json);
        } catch {
          return String(json);
        }
      })(),
      500,
    );
    throw new Error(
      `Failed to parse upload register response via parseRegisterResponse: ${message}. payload=${payloadPreview}`,
    );
  }

  return registered.map(
    (file): FileUIPart => ({
      filename: file.name,
      mediaType: file.mimeType,
      type: "file",
      url: file.storageKey,
    }),
  );
}
