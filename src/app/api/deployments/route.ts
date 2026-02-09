import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import {
  createDeploymentRecord,
  listDeploymentsByProject,
} from "@/lib/data/deployments.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonCreated, jsonError, jsonOk } from "@/lib/next/responses";

const listQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  projectId: z.string().min(1),
  runId: z.string().min(1).optional(),
});

const createBodySchema = z.strictObject({
  deploymentUrl: z.string().min(1).optional(),
  endedAt: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  projectId: z.string().min(1),
  provider: z.enum(["vercel"]).optional(),
  runId: z.string().min(1).optional(),
  startedAt: z.string().min(1).optional(),
  status: z.string().min(1),
  vercelDeploymentId: z.string().min(1).optional(),
  vercelProjectId: z.string().min(1).optional(),
});

function parseOptionalDate(value: string | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

/**
 * List deployments for a project (optionally filtered by run).
 *
 * @param req - HTTP request.
 * @returns Deployment list or JSON error.
 * @throws AppError - With code "bad_request" when query params are invalid.
 * @throws AppError - With code "forbidden" when the project is not accessible.
 */
export async function GET(req: Request) {
  try {
    const authPromise = requireAppUserApi();
    const { searchParams } = new URL(req.url);
    const parsedQuery = listQuerySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      projectId: searchParams.get("projectId") ?? "",
      runId: searchParams.get("runId") ?? undefined,
    });
    if (!parsedQuery.success) {
      throw new AppError("bad_request", 400, "Invalid deployments query.");
    }

    const user = await authPromise;
    const query = parsedQuery.data;

    const project = await getProjectByIdForUser(query.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    const deployments = await listDeploymentsByProject(project.id, {
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.runId === undefined ? {} : { runId: query.runId }),
    });

    return jsonOk({ deployments });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Create a deployment record for a project.
 *
 * @param req - HTTP request.
 * @returns Created deployment record or JSON error.
 * @throws AppError - With code "forbidden" when the project is not accessible.
 */
export async function POST(req: Request) {
  try {
    const authPromise = requireAppUserApi();
    const bodyPromise = parseJsonBody(req, createBodySchema);
    const [user, body] = await Promise.all([authPromise, bodyPromise]);

    const project = await getProjectByIdForUser(body.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    const startedAt = parseOptionalDate(body.startedAt);
    const endedAt = parseOptionalDate(body.endedAt);
    if (startedAt === null || endedAt === null) {
      throw new AppError("bad_request", 400, "Invalid startedAt/endedAt.");
    }

    const deployment = await createDeploymentRecord({
      ...(body.deploymentUrl === undefined
        ? {}
        : { deploymentUrl: body.deploymentUrl }),
      ...(endedAt === undefined ? {} : { endedAt }),
      ...(body.metadata === undefined ? {} : { metadata: body.metadata }),
      projectId: project.id,
      ...(body.provider === undefined ? {} : { provider: body.provider }),
      ...(body.runId === undefined ? {} : { runId: body.runId }),
      ...(startedAt === undefined ? {} : { startedAt }),
      status: body.status,
      ...(body.vercelDeploymentId === undefined
        ? {}
        : { vercelDeploymentId: body.vercelDeploymentId }),
      ...(body.vercelProjectId === undefined
        ? {}
        : { vercelProjectId: body.vercelProjectId }),
    });

    return jsonCreated({ deployment });
  } catch (err) {
    return jsonError(err);
  }
}
