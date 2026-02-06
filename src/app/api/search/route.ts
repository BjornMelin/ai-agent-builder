import { and, eq, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import {
  retrieveProjectArtifacts,
  retrieveProjectChunks,
} from "@/lib/ai/tools/retrieval.server";
import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import type { JsonError } from "@/lib/core/errors";
import { AppError } from "@/lib/core/errors";
import { LEGACY_UNOWNED_PROJECT_OWNER_ID } from "@/lib/data/project-ownership";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import {
  SEARCH_SCOPES,
  SEARCH_TYPE_FILTERS,
  type SearchResponse,
  type SearchResult,
  type SearchScope,
  type SearchTypeFilter,
} from "@/lib/search/types";
import { limitSearchRequest } from "@/lib/upstash/ratelimit.server";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 256;
const PROJECT_DEFAULT_TYPES: readonly SearchTypeFilter[] = [
  "uploads",
  "chunks",
  "artifacts",
  "runs",
];
const PROJECT_TYPE_SET = new Set<SearchTypeFilter>(PROJECT_DEFAULT_TYPES);
const CURSOR_PATTERN = /^[A-Za-z0-9:_=-]{1,128}$/;
const GLOBAL_DEFAULT_TYPES: readonly SearchTypeFilter[] = [
  "projects",
  "uploads",
  "chunks",
  "artifacts",
  "runs",
];

type GlobalArtifactRow = Readonly<{
  id: string;
  projectId: string;
  kind: string;
  logicalKey: string;
  version: number;
  title: string;
  snippet: string;
}>;

type GlobalChunkRow = Readonly<{
  id: string;
  projectId: string;
  fileId: string;
  chunkIndex: number;
  pageStart: number | null;
  pageEnd: number | null;
  snippet: string;
}>;

type RunRow = Readonly<{
  id: string;
  projectId: string;
  kind: "research" | "implementation";
  status:
    | "pending"
    | "running"
    | "waiting"
    | "blocked"
    | "succeeded"
    | "failed"
    | "canceled";
  metadata: Record<string, unknown>;
}>;

function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, (match) => `\\${match}`);
}

function optionalParam(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function toTypeTokens(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const tokens = value
    .split(/[|,]/g)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  return tokens.length === 0 ? undefined : tokens;
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && first.length > 0) {
      return first;
    }
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return null;
}

const searchQuerySchema = z
  .strictObject({
    cursor: z.string().trim().max(128).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    projectId: z.string().trim().min(1).optional(),
    q: z.string().trim().min(MIN_QUERY_LENGTH).max(MAX_QUERY_LENGTH),
    scope: z.enum(SEARCH_SCOPES).optional(),
    types: z.array(z.enum(SEARCH_TYPE_FILTERS)).optional(),
  })
  .superRefine((value, ctx) => {
    const scope = value.scope ?? (value.projectId ? "project" : "global");
    if (scope === "project" && !value.projectId) {
      ctx.addIssue({
        code: "custom",
        message: "projectId is required for project scope.",
        path: ["projectId"],
      });
    }
    if (scope === "project" && value.types) {
      const unsupported = value.types.filter(
        (token) => !PROJECT_TYPE_SET.has(token),
      );
      if (unsupported.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: `Invalid project scope types: ${unsupported.join(", ")}.`,
          path: ["types"],
        });
      }
    }
    if (value.cursor && !CURSOR_PATTERN.test(value.cursor)) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid cursor.",
        path: ["cursor"],
      });
    }
  })
  .transform((value) => {
    const scope: SearchScope =
      value.scope ?? (value.projectId ? "project" : "global");
    const defaults =
      scope === "project" ? PROJECT_DEFAULT_TYPES : GLOBAL_DEFAULT_TYPES;
    return {
      cursor: value.cursor ?? null,
      limit: value.limit,
      projectId: value.projectId ?? null,
      q: value.q,
      scope,
      types: value.types ? [...new Set(value.types)] : defaults,
    };
  });

type SearchQueryInput = z.input<typeof searchQuerySchema>;
type SearchQuery = z.output<typeof searchQuerySchema>;

function parseSearchQuery(url: URL): SearchQuery {
  const scope = optionalParam(url.searchParams.get("scope"))?.toLowerCase();
  const types = toTypeTokens(optionalParam(url.searchParams.get("types")));

  const input: SearchQueryInput = {
    cursor: optionalParam(url.searchParams.get("cursor")),
    limit: optionalParam(url.searchParams.get("limit")),
    projectId: optionalParam(url.searchParams.get("projectId")),
    q: optionalParam(url.searchParams.get("q")) ?? "",
    scope:
      scope === undefined ? undefined : (scope as SearchQueryInput["scope"]),
    types:
      types === undefined ? undefined : (types as SearchQueryInput["types"]),
  };

  const parsed = searchQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid search query.",
      parsed.error,
    );
  }

  return parsed.data;
}

function sortAndLimit(
  results: readonly SearchResult[],
  limit: number,
): readonly SearchResult[] {
  const deduped = [
    ...new Map(
      results.map((result) => [`${result.type}:${result.id}`, result]),
    ).values(),
  ];

  deduped.sort((left, right) => {
    const leftScore = "score" in left ? left.score : null;
    const rightScore = "score" in right ? right.score : null;
    if (leftScore !== null && rightScore !== null) {
      return rightScore - leftScore;
    }
    if (leftScore !== null) return -1;
    if (rightScore !== null) return 1;
    return left.title.localeCompare(right.title);
  });

  return deduped.slice(0, limit);
}

async function searchProjects(
  userId: string,
  q: string,
  limit: number,
): Promise<readonly SearchResult[]> {
  const db = getDb();
  const pattern = `%${escapeLikePattern(q)}%`;
  const projects = await db.query.projectsTable.findMany({
    limit,
    orderBy: (table, { desc }) => [desc(table.updatedAt)],
    where: and(
      or(
        eq(schema.projectsTable.ownerUserId, userId),
        eq(schema.projectsTable.ownerUserId, LEGACY_UNOWNED_PROJECT_OWNER_ID),
      ),
      sql`${schema.projectsTable.name} ILIKE ${pattern} ESCAPE '\\'`,
    ),
  });

  return projects.map((project) => ({
    href: `/projects/${project.id}`,
    id: project.id,
    title: project.name,
    type: "project" as const,
  }));
}

async function searchProjectUploads(
  projectId: string,
  q: string,
  limit: number,
): Promise<readonly SearchResult[]> {
  const db = getDb();
  const pattern = `%${escapeLikePattern(q)}%`;
  const rows = await db.query.projectFilesTable.findMany({
    limit,
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    where: and(
      eq(schema.projectFilesTable.projectId, projectId),
      sql`${schema.projectFilesTable.name} ILIKE ${pattern} ESCAPE '\\'`,
    ),
  });

  return rows.map((file) => ({
    href: `/projects/${file.projectId}/uploads/${file.id}`,
    id: file.id,
    provenance: {
      mimeType: file.mimeType,
      projectId: file.projectId,
      sizeBytes: file.sizeBytes,
    },
    snippet: `${file.mimeType} · ${(file.sizeBytes / 1024).toFixed(1)} KB`,
    title: file.name,
    type: "upload" as const,
  }));
}

async function searchGlobalUploads(
  userId: string,
  q: string,
  limit: number,
): Promise<readonly SearchResult[]> {
  const db = getDb();
  const pattern = `%${escapeLikePattern(q)}%`;
  const rows = await db.query.projectFilesTable.findMany({
    limit,
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    where: sql`
      ${schema.projectFilesTable.name} ILIKE ${pattern} ESCAPE '\\'
      AND EXISTS (
        SELECT 1
        FROM ${schema.projectsTable}
        WHERE ${schema.projectsTable.id} = ${schema.projectFilesTable.projectId}
          AND (
            ${schema.projectsTable.ownerUserId} = ${userId}
            OR ${schema.projectsTable.ownerUserId} = ${LEGACY_UNOWNED_PROJECT_OWNER_ID}
          )
      )
    `,
  });

  return rows.map((file) => ({
    href: `/projects/${file.projectId}/uploads/${file.id}`,
    id: file.id,
    provenance: {
      mimeType: file.mimeType,
      projectId: file.projectId,
      sizeBytes: file.sizeBytes,
    },
    snippet: `${file.mimeType} · ${(file.sizeBytes / 1024).toFixed(1)} KB`,
    title: file.name,
    type: "upload" as const,
  }));
}

async function searchGlobalArtifacts(
  userId: string,
  q: string,
  limit: number,
): Promise<readonly SearchResult[]> {
  const db = getDb();
  const pattern = `%${escapeLikePattern(q)}%`;
  const result = await db.execute<GlobalArtifactRow>(sql`
    SELECT
      id,
      project_id AS "projectId",
      kind,
      logical_key AS "logicalKey",
      version,
      COALESCE(content->>'title', kind || ' ' || logical_key || ' v' || version::text) AS title,
      SUBSTRING(content::text FROM 1 FOR 240) AS snippet
    FROM artifacts
    WHERE
      (
        kind ILIKE ${pattern} ESCAPE '\\'
        OR logical_key ILIKE ${pattern} ESCAPE '\\'
        OR content::text ILIKE ${pattern} ESCAPE '\\'
      )
      AND EXISTS (
        SELECT 1
        FROM projects
        WHERE projects.id = artifacts.project_id
          AND (
            projects.owner_user_id = ${userId}
            OR projects.owner_user_id = ${LEGACY_UNOWNED_PROJECT_OWNER_ID}
          )
      )
    ORDER BY created_at DESC
    LIMIT ${limit};
  `);

  return result.rows.map((row) => ({
    href: `/projects/${row.projectId}/artifacts/${row.id}`,
    id: row.id,
    provenance: {
      artifactId: row.id,
      kind: row.kind,
      logicalKey: row.logicalKey,
      projectId: row.projectId,
      version: row.version,
    },
    score: 0,
    snippet: row.snippet,
    title: row.title,
    type: "artifact" as const,
  }));
}

async function searchGlobalChunks(
  userId: string,
  q: string,
  limit: number,
): Promise<readonly SearchResult[]> {
  const db = getDb();
  const pattern = `%${escapeLikePattern(q)}%`;
  const result = await db.execute<GlobalChunkRow>(sql`
    SELECT
      id,
      project_id AS "projectId",
      file_id AS "fileId",
      chunk_index AS "chunkIndex",
      page_start AS "pageStart",
      page_end AS "pageEnd",
      SUBSTRING(content FROM 1 FOR 240) AS snippet
    FROM file_chunks
    WHERE
      content ILIKE ${pattern} ESCAPE '\\'
      AND EXISTS (
        SELECT 1
        FROM projects
        WHERE projects.id = file_chunks.project_id
          AND (
            projects.owner_user_id = ${userId}
            OR projects.owner_user_id = ${LEGACY_UNOWNED_PROJECT_OWNER_ID}
          )
      )
    ORDER BY created_at DESC
    LIMIT ${limit};
  `);

  return result.rows.map((row) => ({
    href: `/projects/${row.projectId}/uploads/${row.fileId}`,
    id: row.id,
    provenance: {
      chunkIndex: row.chunkIndex,
      fileId: row.fileId,
      pageEnd: row.pageEnd ?? undefined,
      pageStart: row.pageStart ?? undefined,
      projectId: row.projectId,
    },
    score: 0,
    snippet: row.snippet,
    title: `Upload chunk ${row.chunkIndex}`,
    type: "chunk" as const,
  }));
}

function toRunSnippet(row: RunRow): string {
  const metadataText = JSON.stringify(row.metadata);
  if (metadataText !== "{}") {
    return metadataText.length > 180
      ? `${metadataText.slice(0, 180)}…`
      : metadataText;
  }

  return `Status: ${row.status}`;
}

function toRunSearchResult(row: RunRow): SearchResult {
  return {
    href: `/projects/${row.projectId}/runs/${row.id}`,
    id: row.id,
    provenance: {
      kind: row.kind,
      projectId: row.projectId,
      status: row.status,
    },
    snippet: toRunSnippet(row),
    title: `${row.kind} run · ${row.status}`,
    type: "run",
  };
}

async function searchProjectRuns(
  projectId: string,
  q: string,
  limit: number,
): Promise<readonly SearchResult[]> {
  const db = getDb();
  const pattern = `%${escapeLikePattern(q)}%`;
  const rows = await db.query.runsTable.findMany({
    limit,
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    where: and(
      eq(schema.runsTable.projectId, projectId),
      sql`(
        ${schema.runsTable.id}::text ILIKE ${pattern} ESCAPE '\\'
        OR ${schema.runsTable.kind}::text ILIKE ${pattern} ESCAPE '\\'
        OR ${schema.runsTable.status}::text ILIKE ${pattern} ESCAPE '\\'
        OR ${schema.runsTable.metadata}::text ILIKE ${pattern} ESCAPE '\\'
      )`,
    ),
  });

  return rows.map((row) =>
    toRunSearchResult({
      id: row.id,
      kind: row.kind,
      metadata: row.metadata,
      projectId: row.projectId,
      status: row.status,
    }),
  );
}

async function searchGlobalRuns(
  userId: string,
  q: string,
  limit: number,
): Promise<readonly SearchResult[]> {
  const db = getDb();
  const pattern = `%${escapeLikePattern(q)}%`;
  const rows = await db.query.runsTable.findMany({
    limit,
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    where: sql`(
      ${schema.runsTable.id}::text ILIKE ${pattern} ESCAPE '\\'
      OR ${schema.runsTable.kind}::text ILIKE ${pattern} ESCAPE '\\'
      OR ${schema.runsTable.status}::text ILIKE ${pattern} ESCAPE '\\'
      OR ${schema.runsTable.metadata}::text ILIKE ${pattern} ESCAPE '\\'
    ) AND EXISTS (
      SELECT 1
      FROM ${schema.projectsTable}
      WHERE ${schema.projectsTable.id} = ${schema.runsTable.projectId}
        AND (
          ${schema.projectsTable.ownerUserId} = ${userId}
          OR ${schema.projectsTable.ownerUserId} = ${LEGACY_UNOWNED_PROJECT_OWNER_ID}
        )
    )`,
  });

  return rows.map((row) =>
    toRunSearchResult({
      id: row.id,
      kind: row.kind,
      metadata: row.metadata,
      projectId: row.projectId,
      status: row.status,
    }),
  );
}

/**
 * Search endpoint for typeahead and global/project search.
 *
 * @param req - HTTP request.
 * @returns Search response or JSON error.
 * @throws AppError - With status 400 when query parameters are invalid.
 */
export async function GET(
  req: Request,
): Promise<NextResponse<SearchResponse | JsonError>> {
  try {
    const url = new URL(req.url);
    const user = await requireAppUserApi();
    const query = parseSearchQuery(url);

    const clientIp = getClientIp(req) ?? "unknown";
    const rateLimit = await limitSearchRequest(`search:${user.id}:${clientIp}`);
    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: {
            code: "rate_limited",
            message: "Too many search requests. Please retry shortly.",
          },
        } satisfies JsonError,
        {
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds ?? 1),
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(rateLimit.reset),
          },
          status: 429,
        },
      );
    }

    const results: SearchResult[] = [];

    if (query.scope === "project") {
      const projectId = query.projectId;
      if (!projectId) {
        throw new AppError(
          "bad_request",
          400,
          "projectId is required for project scope.",
        );
      }

      const project = await getProjectByIdForUser(projectId, user.id);
      if (!project) {
        throw new AppError("not_found", 404, "Project not found.");
      }

      if (query.types.includes("uploads")) {
        const uploadResults = await searchProjectUploads(
          projectId,
          query.q,
          query.limit,
        );
        results.push(...uploadResults);
      }

      if (query.types.includes("runs")) {
        const runResults = await searchProjectRuns(
          projectId,
          query.q,
          query.limit,
        );
        results.push(...runResults);
      }

      const retrievalTopK = Math.min(query.limit, 20);
      const retrievalTasks: Promise<void>[] = [];

      if (query.types.includes("chunks")) {
        retrievalTasks.push(
          retrieveProjectChunks({
            projectId,
            q: query.q,
            topK: retrievalTopK,
          }).then((hits) => {
            results.push(
              ...hits.map((hit) => ({
                href: `/projects/${hit.provenance.projectId}/uploads/${hit.provenance.fileId}`,
                id: hit.id,
                provenance: {
                  chunkIndex: hit.provenance.chunkIndex,
                  fileId: hit.provenance.fileId,
                  pageEnd: hit.provenance.pageEnd,
                  pageStart: hit.provenance.pageStart,
                  projectId: hit.provenance.projectId,
                },
                score: hit.score,
                snippet: hit.snippet,
                title: `Upload chunk ${hit.provenance.chunkIndex}`,
                type: "chunk" as const,
              })),
            );
          }),
        );
      }

      if (query.types.includes("artifacts")) {
        retrievalTasks.push(
          retrieveProjectArtifacts({
            projectId,
            q: query.q,
            topK: retrievalTopK,
          }).then((hits) => {
            results.push(
              ...hits.map((hit) => ({
                href: `/projects/${hit.provenance.projectId}/artifacts/${hit.provenance.artifactId}`,
                id: hit.id,
                provenance: {
                  artifactId: hit.provenance.artifactId,
                  kind: hit.provenance.kind,
                  logicalKey: hit.provenance.logicalKey,
                  projectId: hit.provenance.projectId,
                  version: hit.provenance.version,
                },
                score: hit.score,
                snippet: hit.snippet,
                title: hit.title,
                type: "artifact" as const,
              })),
            );
          }),
        );
      }

      await Promise.all(retrievalTasks);
    } else {
      const tasks: Promise<void>[] = [];

      if (query.types.includes("projects")) {
        tasks.push(
          searchProjects(user.id, query.q, query.limit).then(
            (projectResults) => {
              results.push(...projectResults);
            },
          ),
        );
      }

      if (query.types.includes("uploads")) {
        tasks.push(
          searchGlobalUploads(user.id, query.q, query.limit).then(
            (uploadResults) => {
              results.push(...uploadResults);
            },
          ),
        );
      }

      if (query.types.includes("artifacts")) {
        tasks.push(
          searchGlobalArtifacts(user.id, query.q, query.limit).then(
            (artifactResults) => {
              results.push(...artifactResults);
            },
          ),
        );
      }

      if (query.types.includes("chunks")) {
        tasks.push(
          searchGlobalChunks(user.id, query.q, query.limit).then(
            (chunkResults) => {
              results.push(...chunkResults);
            },
          ),
        );
      }

      if (query.types.includes("runs")) {
        tasks.push(
          searchGlobalRuns(user.id, query.q, query.limit).then((runResults) => {
            results.push(...runResults);
          }),
        );
      }

      await Promise.all(tasks);
    }

    const merged = sortAndLimit(results, query.limit);

    return jsonOk<SearchResponse>({
      meta: {
        cursor: query.cursor,
        limit: query.limit,
        nextCursor: null,
        scope: query.scope,
        types: query.types,
      },
      results: merged,
    });
  } catch (err) {
    return jsonError(err);
  }
}
