import { createHmac, timingSafeEqual } from "node:crypto";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/next/responses";

const SIGNATURE_PREFIX = "sha256=";

function verifyGitHubSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  const provided = signatureHeader.trim();
  if (!provided.startsWith(SIGNATURE_PREFIX)) return false;

  const computed =
    SIGNATURE_PREFIX +
    createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(computed, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * GitHub webhook ingestion endpoint.
 *
 * @remarks
 * Verifies the request signature using `GITHUB_WEBHOOK_SECRET`. When the secret
 * is not configured, the handler returns 501 (safe-by-default).
 *
 * @param req - HTTP request.
 * @returns JSON ok or JSON error.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const secret = env.github.webhookSecret;
    if (!secret) {
      throw new AppError("not_configured", 501, "Webhook not configured.");
    }

    const signature = req.headers.get("x-hub-signature-256");
    if (!signature) {
      throw new AppError("unauthorized", 401, "Missing x-hub-signature-256.");
    }

    const rawBody = Buffer.from(await req.arrayBuffer());
    if (!verifyGitHubSignature(rawBody, signature, secret)) {
      throw new AppError("unauthorized", 401, "Invalid webhook signature.");
    }

    // For the foundation, we accept + verify and treat ingestion as best-effort.
    // Full GitHub check/deployment ingestion is implemented in workflow steps.
    void rawBody;

    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
