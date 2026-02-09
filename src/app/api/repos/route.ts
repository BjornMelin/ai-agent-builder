import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import {
  listReposByProject,
  upsertRepoConnection,
} from "@/lib/data/repos.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonCreated, jsonError, jsonOk } from "@/lib/next/responses";
import {
  fetchGitHubRepoInfo,
  isGitHubConfigured,
} from "@/lib/repo/github.client.server";

const listQuerySchema = z.strictObject({
  projectId: z.string().min(1),
});

const connectRepoSchema = z.strictObject({
  cloneUrl: z.url().optional(),
  defaultBranch: z.string().min(1).optional(),
  htmlUrl: z.url().optional(),
  name: z.string().min(1),
  owner: z.string().min(1),
  projectId: z.string().min(1),
  provider: z.enum(["github"]),
});

/**
 * List connected repositories for a project.
 *
 * @param req - HTTP request.
 * @returns Repo list payload or JSON error.
 * @throws AppError - With code "bad_request" when query params are invalid.
 * @throws AppError - With code "forbidden" when the project is not accessible.
 */
export async function GET(req: Request) {
  try {
    const authPromise = requireAppUserApi();
    const { searchParams } = new URL(req.url);
    const parsedQuery = listQuerySchema.safeParse({
      projectId: searchParams.get("projectId") ?? "",
    });
    if (!parsedQuery.success) {
      throw new AppError("bad_request", 400, "Invalid repos query.");
    }

    const user = await authPromise;
    const { projectId } = parsedQuery.data;

    const project = await getProjectByIdForUser(projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    const repos = await listReposByProject(project.id);
    return jsonOk({ repos });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Connect a repository to a project (metadata only).
 *
 * @param req - HTTP request.
 * @returns Connected repo record or JSON error.
 * @throws AppError - With code "bad_request" when body is invalid.
 * @throws AppError - With code "forbidden" when the project is not accessible.
 */
export async function POST(req: Request) {
  try {
    const authPromise = requireAppUserApi();
    const bodyPromise = parseJsonBody(req, connectRepoSchema);
    const [user, body] = await Promise.all([authPromise, bodyPromise]);

    const project = await getProjectByIdForUser(body.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    let repoInfo: Readonly<{
      owner: string;
      name: string;
      cloneUrl: string;
      htmlUrl: string;
      defaultBranch: string;
    }> | null = null;

    if (body.provider === "github" && isGitHubConfigured()) {
      repoInfo = await fetchGitHubRepoInfo({
        name: body.name,
        owner: body.owner,
      });
    }

    if (!repoInfo) {
      const cloneUrl = body.cloneUrl?.trim() ?? "";
      const htmlUrl = body.htmlUrl?.trim() ?? "";
      const defaultBranch = body.defaultBranch?.trim() ?? "";

      if (!cloneUrl || !htmlUrl || !defaultBranch) {
        throw new AppError(
          "bad_request",
          400,
          "Missing cloneUrl/htmlUrl/defaultBranch (GitHub API is not configured).",
        );
      }

      repoInfo = {
        cloneUrl,
        defaultBranch,
        htmlUrl,
        name: body.name.trim(),
        owner: body.owner.trim(),
      };
    }

    const repo = await upsertRepoConnection({
      cloneUrl: repoInfo.cloneUrl,
      defaultBranch: repoInfo.defaultBranch,
      htmlUrl: repoInfo.htmlUrl,
      name: repoInfo.name,
      owner: repoInfo.owner,
      projectId: project.id,
      provider: body.provider,
    });

    return jsonCreated({ repo });
  } catch (err) {
    return jsonError(err);
  }
}
