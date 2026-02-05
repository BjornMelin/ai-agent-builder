import { sql } from "drizzle-orm";
import type { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import {
  retrieveProjectArtifacts,
  retrieveProjectChunks,
} from "@/lib/ai/tools/retrieval.server";
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
    }>
  | Readonly<{
      type: "artifact";
      id: string;
      score: number;
      title: string;
      snippet: string;
      href: string;
      provenance: Readonly<{
        projectId: string;
        artifactId: string;
        kind: string;
        logicalKey: string;
        version: number;
      }>;
    }>;

type SearchResponse = Readonly<{ results: readonly SearchResult[] }>;

function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, (match) => `\\${match}`);
}

/**
 * Search endpoint for typeahead and global search.
 *
 * @param req - HTTP request.
 * @returns Search response or JSON error.
 * @throws AppError - With status 400 when query parameter q is missing or empty.
 */
export async function GET(
  req: Request,
): Promise<NextResponse<SearchResponse | JsonError>> {
  try {
    const authPromise = requireAppUserApi();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const projectId = (url.searchParams.get("projectId") ?? "").trim();

    if (q.length === 0) {
      throw new AppError("bad_request", 400, "Missing q.");
    }

    await authPromise;

    if (projectId) {
      const [chunkHits, artifactHits] = await Promise.all([
        retrieveProjectChunks({ projectId, q }),
        retrieveProjectArtifacts({ projectId, q }),
      ]);

      const merged: SearchResult[] = [
        ...chunkHits.map((h) => ({
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
          type: "chunk" as const,
        })),
        ...artifactHits.map((h) => ({
          href: `/projects/${h.provenance.projectId}/artifacts/${h.provenance.artifactId}`,
          id: h.id,
          provenance: {
            artifactId: h.provenance.artifactId,
            kind: h.provenance.kind,
            logicalKey: h.provenance.logicalKey,
            projectId: h.provenance.projectId,
            version: h.provenance.version,
          },
          score: h.score,
          snippet: h.snippet,
          title: h.title,
          type: "artifact" as const,
        })),
      ];

      merged.sort((a, b) => {
        if ("score" in a && "score" in b) return b.score - a.score;
        if ("score" in a) return -1;
        if ("score" in b) return 1;
        return 0;
      });

      return jsonOk<SearchResponse>({
        results: merged.slice(0, 10),
      });
    }

    const db = getDb();
    const pattern = `%${escapeLikePattern(q)}%`;
    const projects = await db.query.projectsTable.findMany({
      limit: 10,
      orderBy: (t, { desc }) => [desc(t.updatedAt)],
      where: sql`${schema.projectsTable.name} ILIKE ${pattern} ESCAPE '\\'`,
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
