import { z } from "zod";

import { indexArtifactVersion } from "@/lib/artifacts/index-artifact.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { verifyQstashSignatureAppRouter } from "@/lib/upstash/qstash.server";

const bodySchema = z.strictObject({
  artifactId: z.string().min(1),
  kind: z.string().min(1),
  logicalKey: z.string().min(1),
  projectId: z.string().min(1),
  version: z.number().int().positive(),
});

/**
 * Index a single artifact version into Upstash Vector.
 *
 * @remarks
 * This route is intended to be called asynchronously via QStash. The request is
 * signature-verified, and the handler is idempotent (safe under retries).
 *
 * @param req - HTTP request containing the index job payload.
 * @returns JSON ok or JSON error.
 * @throws AppError - When body validation fails (400).
 */
export const POST = verifyQstashSignatureAppRouter(async (req: Request) => {
  try {
    const parsed = await parseJsonBody(req, bodySchema);
    await indexArtifactVersion(parsed);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
});
