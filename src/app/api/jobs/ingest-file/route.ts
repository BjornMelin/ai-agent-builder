import { z } from "zod";
import { AppError } from "@/lib/core/errors";
import { getProjectFileById } from "@/lib/data/files.server";
import { ingestFile } from "@/lib/ingest/ingest-file.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { verifyQstashSignatureAppRouter } from "@/lib/upstash/qstash.server";

const bodySchema = z.strictObject({
  fileId: z.string().min(1),
  projectId: z.string().min(1),
});

export const POST = verifyQstashSignatureAppRouter(async (req: Request) => {
  try {
    const raw = await req.text();
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch (err) {
      throw new AppError("bad_request", 400, "Invalid JSON body.", err);
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("bad_request", 400, "Invalid request body.");
    }

    const { fileId, projectId } = parsed.data;
    const file = await getProjectFileById(fileId);
    if (!file || file.projectId !== projectId) {
      throw new AppError("not_found", 404, "File not found.");
    }

    const res = await fetch(file.storageKey);
    if (!res.ok) {
      throw new AppError(
        "blob_fetch_failed",
        502,
        `Failed to fetch blob (${res.status}).`,
      );
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    const result = await ingestFile({
      bytes,
      fileId,
      mimeType: file.mimeType,
      name: file.name,
      projectId,
    });

    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
});
