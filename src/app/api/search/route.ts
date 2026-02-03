import { ilike } from "drizzle-orm";
import type { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { retrieveProjectChunks } from "@/lib/ai/tools/retrieval.server";
import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import type { JsonError } from "@/lib/core/errors";
import { AppError } from "@/lib/core/errors";
import { jsonError, jsonOk } from "@/lib/next/responses";

type SearchResult =
  | Readonly<{
      type: "project";
      id: string;
      title: string;
      href: string;
    }>
  | Readonly<{
      type: "chunk";
      id: string;
      score: number;
      title: string;
      snippet: string;
      href: string;
      provenance: Readonly<{
        projectId: string;
        fileId: string;
        chunkIndex: number;
        pageStart: number | undefined;
        pageEnd: number | undefined;
      }>;
    }>;

type SearchResponse = Readonly<{ results: readonly SearchResult[] }>;

/**
 * Search endpoint for typeahead and global search.
 *
 * @param req - HTTP request.
 * @returns Search response or JSON error.
 */
export async function GET(
  req: Request,
): Promise<NextResponse<SearchResponse | JsonError>> {
  try {
    await requireAppUserApi();

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const projectId = (url.searchParams.get("projectId") ?? "").trim();

    if (q.length === 0) {
      throw new AppError("bad_request", 400, "Missing q.");
    }

    if (projectId) {
      const hits = await retrieveProjectChunks({ projectId, q });
      return jsonOk<SearchResponse>({
        results: hits.map((h) => ({
          href: `/projects/${h.provenance.projectId}/uploads/${h.provenance.fileId}`,
          id: h.id,
          provenance: {
            chunkIndex: h.provenance.chunkIndex,
            fileId: h.provenance.fileId,
            pageEnd: h.provenance.pageEnd,
            pageStart: h.provenance.pageStart,
            projectId: h.provenance.projectId,
          },
          score: h.score,
          snippet: h.snippet,
          title: `Upload chunk ${h.provenance.chunkIndex}`,
          type: "chunk",
        })),
      });
    }

    const db = getDb();
    const projects = await db.query.projectsTable.findMany({
      limit: 10,
      orderBy: (t, { desc }) => [desc(t.updatedAt)],
      where: ilike(schema.projectsTable.name, `%${q}%`),
    });

    return jsonOk<SearchResponse>({
      results: projects.map((p) => ({
        href: `/projects/${p.id}`,
        id: p.id,
        title: p.name,
        type: "project",
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
