import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import type { NextResponse } from "next/server";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError, type JsonError } from "@/lib/core/errors";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { env } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { allowedUploadMimeTypes } from "@/lib/uploads/allowed-mime-types";
import { assertValidProjectUploadPathname } from "@/lib/uploads/trusted-blob-url.server";

function safeParseClientPayload(payload: string | null): { projectId: string } {
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
  return { projectId: projectId.trim() };
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
    const userPromise = requireAppUserApi();
    const bodyPromise = req.json().catch(() => null);
    const [user, body] = await Promise.all([userPromise, bodyPromise]);

    if (!body) {
      throw new AppError("bad_request", 400, "Invalid request body.");
    }

    const result = await handleUpload({
      body: body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { projectId } = safeParseClientPayload(clientPayload);
        assertValidProjectUploadPathname({ pathname, projectId });

        const project = await getProjectByIdForUser(projectId, user.id);
        if (!project) {
          throw new AppError("not_found", 404, "Project not found.");
        }

        return {
          addRandomSuffix: true,
          allowedContentTypes: [...allowedUploadMimeTypes],
          allowOverwrite: false,
          maximumSizeInBytes: budgets.maxUploadBytes,
          tokenPayload: clientPayload,
        };
      },
      request: req,
      token: env.blob.readWriteToken,
    });

    if (result.type === "blob.generate-client-token") {
      return jsonOk({ clientToken: result.clientToken });
    }

    // We don't register upload completion callbacks for these tokens, but handle
    // the response defensively if one is received.
    return jsonOk({ response: "ok" as const });
  } catch (err) {
    return jsonError(err);
  }
}
