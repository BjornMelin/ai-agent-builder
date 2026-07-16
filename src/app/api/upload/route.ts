import { del } from "@vercel/blob";
import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import type { NextResponse } from "next/server";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError, type JsonError } from "@/lib/core/errors";
import {
  issueProjectUploadGrant,
  PROJECT_UPLOAD_GRANT_TTL_MS,
  removeRejectedProjectUploadGrant,
  resolveProjectUploadCompletion,
} from "@/lib/data/project-upload-grants.server";
import { env } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { allowedUploadMimeTypes } from "@/lib/uploads/allowed-mime-types";
import { assertValidProjectUploadPathname } from "@/lib/uploads/trusted-blob-url.server";

function safeParseUploadPayload(payload: string | null): {
  grantId: string | null;
  projectId: string;
} {
  if (!payload) {
    throw new AppError("bad_request", 400, "Missing upload payload.");
  }
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new AppError("bad_request", 400, "Invalid upload payload.");
  }
  if (!value || typeof value !== "object") {
    throw new AppError("bad_request", 400, "Invalid upload payload.");
  }
  const projectId = (value as Record<string, unknown>).projectId;
  if (typeof projectId !== "string" || projectId.trim().length === 0) {
    throw new AppError("bad_request", 400, "Missing projectId.");
  }
  const grantId = (value as Record<string, unknown>).grantId;
  if (
    grantId !== undefined &&
    (typeof grantId !== "string" || grantId.trim().length === 0)
  ) {
    throw new AppError("bad_request", 400, "Invalid upload grant.");
  }
  return {
    grantId: typeof grantId === "string" ? grantId.trim() : null,
    projectId: projectId.trim(),
  };
}

/**
 * Vercel Blob client upload token exchange endpoint.
 *
 * @remarks
 * This route is used by `@vercel/blob/client upload()` via `handleUploadUrl`.
 * It issues scoped client tokens for authorized project uploads.
 *
 * @param req - HTTP request.
 * @returns JSON response with a client token.
 * @throws AppError - Thrown when request validation fails or the project is not found.
 */
export async function POST(
  req: Request,
): Promise<
  NextResponse<
    Readonly<{ clientToken: string }> | Readonly<{ response: "ok" }> | JsonError
  >
> {
  try {
    const body: unknown = await req.json().catch(() => null);

    if (!body) {
      throw new AppError("bad_request", 400, "Invalid request body.");
    }

    const result = await handleUpload({
      body: body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Blob completion callbacks are authenticated by handleUpload's signed
        // payload, not by an end-user session. Resolve user auth only in the
        // client-token branch that actually needs it.
        const user = await requireAppUserApi();
        const { projectId } = safeParseUploadPayload(clientPayload);
        assertValidProjectUploadPathname({ pathname, projectId });
        const validUntil = Date.now() + PROJECT_UPLOAD_GRANT_TTL_MS;
        const grant = await issueProjectUploadGrant({
          expiresAt: new Date(validUntil),
          pathname,
          projectId,
          userId: user.id,
        });

        return {
          addRandomSuffix: true,
          allowedContentTypes: [...allowedUploadMimeTypes],
          allowOverwrite: false,
          maximumSizeInBytes: budgets.maxUploadBytes,
          tokenPayload: JSON.stringify({ grantId: grant.id, projectId }),
          validUntil,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { grantId, projectId } = safeParseUploadPayload(
          tokenPayload ?? null,
        );
        if (!grantId) {
          throw new AppError("bad_request", 400, "Missing upload grant.");
        }
        assertValidProjectUploadPathname({
          pathname: blob.pathname,
          projectId,
        });
        const disposition = await resolveProjectUploadCompletion({
          grantId,
          projectId,
        });
        if (disposition === "delete") {
          await del(blob.url, { token: env.blob.readWriteToken });
          await removeRejectedProjectUploadGrant({ grantId, projectId });
        }
      },
      request: req,
      token: env.blob.readWriteToken,
    });

    if (result.type === "blob.generate-client-token") {
      return jsonOk({ clientToken: result.clientToken });
    }

    return jsonOk({ response: "ok" as const });
  } catch (err) {
    return jsonError(err);
  }
}
