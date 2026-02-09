import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import {
  approveApprovalRequest,
  getApprovalById,
  listPendingApprovals,
} from "@/lib/data/approvals.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { getRunById } from "@/lib/data/runs.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import {
  approvalHookToken,
  resumeApprovalHook,
} from "@/workflows/approvals/hooks/approval";

const listQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  projectId: z.string().min(1),
  runId: z.string().min(1).optional(),
});

const approveBodySchema = z.strictObject({
  approvalId: z.string().min(1),
});

/**
 * List pending approvals (optionally filtered by run).
 *
 * @param req - HTTP request.
 * @returns Pending approvals or JSON error.
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
      throw new AppError("bad_request", 400, "Invalid approvals query.");
    }

    const user = await authPromise;
    const query = parsedQuery.data;

    const project = await getProjectByIdForUser(query.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    const approvals = await listPendingApprovals(project.id, {
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.runId === undefined ? {} : { runId: query.runId }),
    });

    return jsonOk({ approvals });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Approve a pending approval request.
 *
 * @param req - HTTP request.
 * @returns Approved approval record or JSON error.
 * @throws AppError - With code "not_found" when approval does not exist.
 * @throws AppError - With code "forbidden" when the approval's project is not accessible.
 */
export async function POST(req: Request) {
  try {
    const authPromise = requireAppUserApi();
    const bodyPromise = parseJsonBody(req, approveBodySchema);
    const [user, body] = await Promise.all([authPromise, bodyPromise]);

    const existing = await getApprovalById(body.approvalId);
    if (!existing) {
      throw new AppError("not_found", 404, "Approval not found.");
    }

    const project = await getProjectByIdForUser(existing.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    const approvedBy =
      typeof user.email === "string" && user.email.trim().length > 0
        ? user.email
        : user.id;

    const updated = await approveApprovalRequest({
      approvalId: existing.id,
      approvedBy,
    });

    // Best-effort workflow resume for runs that are backed by Workflow DevKit.
    try {
      const run = await getRunById(updated.runId);
      const workflowRunId = run?.workflowRunId ?? null;
      if (workflowRunId) {
        await resumeApprovalHook(approvalHookToken(updated.id), {
          approvalId: updated.id,
          approvedAt: updated.approvedAt,
          approvedBy: updated.approvedBy ?? approvedBy,
          scope: updated.scope,
        });
      }
    } catch {
      // Ignore resume failures; the workflow may poll or the run may be terminal.
    }

    return jsonOk({ approval: updated });
  } catch (err) {
    return jsonError(err);
  }
}
