import { createHmac, timingSafeEqual } from "node:crypto";

import { AppError } from "@/lib/core/errors";
import {
  getDeploymentById,
  getDeploymentByVercelDeploymentIdAnyProject,
  updateDeploymentRecord,
} from "@/lib/data/deployments.server";
import { env } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/next/responses";

type VercelWebhookEvent = Readonly<{
  deploymentId: string | null;
  eventType: string | null;
  raw: Record<string, unknown>;
  status: string | null;
  url: string | null;
}>;

function readString(obj: unknown, path: readonly string[]): string | null {
  let cursor: unknown = obj;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" && cursor.trim().length > 0
    ? cursor.trim()
    : null;
}

function parseVercelWebhookEvent(
  raw: Record<string, unknown>,
): VercelWebhookEvent {
  const eventType =
    readString(raw, ["type"]) ?? readString(raw, ["event"]) ?? null;

  const deploymentId =
    readString(raw, ["deployment", "id"]) ??
    readString(raw, ["payload", "deployment", "id"]) ??
    readString(raw, ["deploymentId"]) ??
    null;

  const status =
    readString(raw, ["deployment", "state"]) ??
    readString(raw, ["deployment", "readyState"]) ??
    readString(raw, ["payload", "deployment", "state"]) ??
    readString(raw, ["payload", "deployment", "readyState"]) ??
    eventType;

  const urlRaw =
    readString(raw, ["deployment", "url"]) ??
    readString(raw, ["payload", "deployment", "url"]) ??
    readString(raw, ["deploymentUrl"]) ??
    null;

  const url = urlRaw?.startsWith("http")
    ? urlRaw
    : urlRaw
      ? `https://${urlRaw}`
      : null;

  return {
    deploymentId,
    eventType,
    raw,
    status,
    url,
  };
}

function verifyVercelSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  const computed = createHmac("sha1", secret).update(rawBody).digest("hex");

  const a = Buffer.from(signatureHeader, "utf8");
  const b = Buffer.from(computed, "utf8");

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Vercel webhook ingestion endpoint.
 *
 * @remarks
 * Verifies the request signature using `VERCEL_WEBHOOK_SECRET` and persists
 * non-secret deployment status updates when a matching deployment record exists.
 *
 * @param req - HTTP request.
 * @returns JSON ok or JSON error.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const secret = env.vercelWebhooks.secret;
    const signature = req.headers.get("x-vercel-signature");
    if (!signature) {
      throw new AppError("unauthorized", 401, "Missing x-vercel-signature.");
    }

    const rawBody = Buffer.from(await req.arrayBuffer());
    if (!verifyVercelSignature(rawBody, signature, secret)) {
      throw new AppError("unauthorized", 401, "Invalid webhook signature.");
    }

    let jsonUnknown: unknown;
    try {
      jsonUnknown = JSON.parse(rawBody.toString("utf8"));
    } catch (err) {
      throw new AppError("bad_request", 400, "Invalid JSON payload.", err);
    }

    const raw =
      jsonUnknown && typeof jsonUnknown === "object"
        ? (jsonUnknown as Record<string, unknown>)
        : null;
    if (!raw) {
      throw new AppError("bad_request", 400, "Invalid webhook payload.");
    }

    const event = parseVercelWebhookEvent(raw);
    if (!event.deploymentId) {
      return jsonOk({ ignored: true, ok: true });
    }

    const deployment = await getDeploymentByVercelDeploymentIdAnyProject(
      event.deploymentId,
    );
    if (!deployment) {
      return jsonOk({ ignored: true, ok: true });
    }

    const existing = await getDeploymentById(deployment.id);
    if (!existing) {
      return jsonOk({ ignored: true, ok: true });
    }

    const receivedAt = new Date().toISOString();
    const nextMetadata = {
      ...existing.metadata,
      vercelWebhook: {
        ...(typeof (existing.metadata as Record<string, unknown>)
          .vercelWebhook === "object" &&
        (existing.metadata as Record<string, unknown>).vercelWebhook
          ? ((existing.metadata as Record<string, unknown>)
              .vercelWebhook as Record<string, unknown>)
          : {}),
        deploymentId: event.deploymentId,
        eventType: event.eventType,
        receivedAt,
        status: event.status,
        url: event.url,
      },
    } satisfies Record<string, unknown>;

    await updateDeploymentRecord(existing.id, {
      ...(event.status ? { status: event.status } : {}),
      ...(event.url ? { deploymentUrl: event.url } : {}),
      metadata: nextMetadata,
    });

    return jsonOk({ ok: true });
  } catch (err) {
    // Missing secrets should be treated as safe-by-default "not configured".
    if (err instanceof AppError && err.code === "env_invalid") {
      return jsonError(
        new AppError("not_configured", 501, "Webhook not configured."),
      );
    }
    return jsonError(err);
  }
}
