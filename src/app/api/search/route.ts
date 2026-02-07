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

function deriveScope(
  scope: SearchScope | undefined,
  projectId: string | undefined,
): SearchScope {
  return scope ?? (projectId ? "project" : "global");
}

const searchQuerySchema = z
  .strictObject({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    projectId: z.string().trim().min(1).optional(),
    q: z.string().trim().min(MIN_QUERY_LENGTH).max(MAX_QUERY_LENGTH),
    scope: z.enum(SEARCH_SCOPES).optional(),
    types: z.array(z.enum(SEARCH_TYPE_FILTERS)).optional(),
  })
  .superRefine((value, ctx) => {
    const scope = deriveScope(value.scope, value.projectId);
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
  })
  .transform((value) => {
    const scope = deriveScope(value.scope, value.projectId);
    const defaults =
      scope === "project" ? PROJECT_DEFAULT_TYPES : GLOBAL_DEFAULT_TYPES;
    return {
      limit: value.limit,
      projectId: value.projectId ?? null,
      q: value.q,
      scope,
      types: value.types ? [...new Set(value.types)] : defaults,
    };
  });

type SearchQuery = z.output<typeof searchQuerySchema>;

function parseSearchQuery(url: URL): SearchQuery {
  const scope = optionalParam(url.searchParams.get("scope"))?.toLowerCase();
  const types = toTypeTokens(optionalParam(url.searchParams.get("types")));

  const input = {
    limit: optionalParam(url.searchParams.get("limit")),
    projectId: optionalParam(url.searchParams.get("projectId")),
    q: optionalParam(url.searchParams.get("q")) ?? "",
    scope,
    types,
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
    // `sizeBytes` is non-null by schema (db + TypeScript), so `toFixed` is safe.
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
      ${schema.artifactsTable.id} AS id,
      ${schema.artifactsTable.projectId} AS "projectId",
      ${schema.artifactsTable.kind} AS kind,
      ${schema.artifactsTable.logicalKey} AS "logicalKey",
      ${schema.artifactsTable.version} AS version,
      COALESCE(
        ${schema.artifactsTable.content}->>'title',
        ${schema.artifactsTable.kind}
          || ' '
          || ${schema.artifactsTable.logicalKey}
          || ' v'
          || ${schema.artifactsTable.version}::text
      ) AS title,
      SUBSTRING(${schema.artifactsTable.content}::text FROM 1 FOR 240) AS snippet
    FROM ${schema.artifactsTable}
    WHERE
      (
        ${schema.artifactsTable.kind} ILIKE ${pattern} ESCAPE '\\'
        OR ${schema.artifactsTable.logicalKey} ILIKE ${pattern} ESCAPE '\\'
        OR ${schema.artifactsTable.content}::text ILIKE ${pattern} ESCAPE '\\'
      )
      AND EXISTS (
        SELECT 1
        FROM ${schema.projectsTable}
        WHERE ${schema.projectsTable.id} = ${schema.artifactsTable.projectId}
          AND (
            ${schema.projectsTable.ownerUserId} = ${userId}
            OR ${schema.projectsTable.ownerUserId} = ${LEGACY_UNOWNED_PROJECT_OWNER_ID}
          )
      )
    ORDER BY ${schema.artifactsTable.createdAt} DESC
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
      ${schema.fileChunksTable.id} AS id,
      ${schema.fileChunksTable.projectId} AS "projectId",
      ${schema.fileChunksTable.fileId} AS "fileId",
      ${schema.fileChunksTable.chunkIndex} AS "chunkIndex",
      ${schema.fileChunksTable.pageStart} AS "pageStart",
      ${schema.fileChunksTable.pageEnd} AS "pageEnd",
      SUBSTRING(${schema.fileChunksTable.content} FROM 1 FOR 240) AS snippet
    FROM ${schema.fileChunksTable}
    WHERE
      ${schema.fileChunksTable.content} ILIKE ${pattern} ESCAPE '\\'
      AND EXISTS (
        SELECT 1
        FROM ${schema.projectsTable}
        WHERE ${schema.projectsTable.id} = ${schema.fileChunksTable.projectId}
          AND (
            ${schema.projectsTable.ownerUserId} = ${userId}
            OR ${schema.projectsTable.ownerUserId} = ${LEGACY_UNOWNED_PROJECT_OWNER_ID}
          )
      )
    ORDER BY ${schema.fileChunksTable.createdAt} DESC
    LIMIT ${limit};
  `);

  return result.rows.map((row) => ({
    href: `/projects/${row.projectId}/uploads/${row.fileId}`,
    id: row.id,
    provenance: {
      chunkIndex: row.chunkIndex,
      fileId: row.fileId,
      projectId: row.projectId,
      ...(row.pageStart !== null ? { pageStart: row.pageStart } : {}),
      ...(row.pageEnd !== null ? { pageEnd: row.pageEnd } : {}),
    },
    score: 0,
    snippet: row.snippet,
    title: `Upload chunk ${row.chunkIndex}`,
    type: "chunk" as const,
  }));
}

function toRunSnippet(row: RunRow): string {
  const keys = Object.keys(row.metadata).sort();
  if (keys.length > 0) {
    const preview = keys.slice(0, 10).join(", ");
    return keys.length > 10
      ? `Meta: ${preview}, … (+${keys.length - 10})`
      : `Meta: ${preview}`;
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
 * @throws AppError - With status 404 (code "not_found") when a project is missing for the user.
 */
export async function GET(
  req: Request,
): Promise<NextResponse<SearchResponse | JsonError>> {
  try {
    const url = new URL(req.url);
    const user = await requireAppUserApi();
    const query = parseSearchQuery(url);

    // Rate limit is per-authenticated user.
    // Do not use `x-forwarded-for`/`x-real-ip` here unless the app is deployed
    // behind a proxy that overwrites those headers; clients can spoof them.
    const rateLimit = await limitSearchRequest(`search:${user.id}`);
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

    let results: readonly SearchResult[] = [];

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

      const tasks: Array<Promise<readonly SearchResult[]>> = [];

      if (query.types.includes("uploads")) {
        tasks.push(searchProjectUploads(projectId, query.q, query.limit));
      }

      if (query.types.includes("runs")) {
        tasks.push(searchProjectRuns(projectId, query.q, query.limit));
      }

      const retrievalTopK = Math.min(query.limit, 20);

      if (query.types.includes("chunks")) {
        tasks.push(
          retrieveProjectChunks({
            projectId,
            q: query.q,
            topK: retrievalTopK,
          }).then((hits) =>
            hits.map((hit) => ({
              href: `/projects/${hit.provenance.projectId}/uploads/${hit.provenance.fileId}`,
              id: hit.id,
              provenance: {
                chunkIndex: hit.provenance.chunkIndex,
                fileId: hit.provenance.fileId,
                projectId: hit.provenance.projectId,
                ...(hit.provenance.pageStart !== undefined
                  ? { pageStart: hit.provenance.pageStart }
                  : {}),
                ...(hit.provenance.pageEnd !== undefined
                  ? { pageEnd: hit.provenance.pageEnd }
                  : {}),
              },
              score: hit.score,
              snippet: hit.snippet,
              title: `Upload chunk ${hit.provenance.chunkIndex}`,
              type: "chunk" as const,
            })),
          ),
        );
      }

      if (query.types.includes("artifacts")) {
        tasks.push(
          retrieveProjectArtifacts({
            projectId,
            q: query.q,
            topK: retrievalTopK,
          }).then((hits) =>
            hits.map((hit) => ({
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
          ),
        );
      }

      results = (await Promise.all(tasks)).flat();
    } else {
      const tasks: Array<Promise<readonly SearchResult[]>> = [];

      if (query.types.includes("projects")) {
        tasks.push(searchProjects(user.id, query.q, query.limit));
      }

      if (query.types.includes("uploads")) {
        tasks.push(searchGlobalUploads(user.id, query.q, query.limit));
      }

      if (query.types.includes("artifacts")) {
        tasks.push(searchGlobalArtifacts(user.id, query.q, query.limit));
      }

      if (query.types.includes("chunks")) {
        tasks.push(searchGlobalChunks(user.id, query.q, query.limit));
      }

      if (query.types.includes("runs")) {
        tasks.push(searchGlobalRuns(user.id, query.q, query.limit));
      }

      results = (await Promise.all(tasks)).flat();
    }

    const merged = sortAndLimit(results, query.limit);

    return jsonOk<SearchResponse>({
      meta: {
        limit: query.limit,
        scope: query.scope,
        types: query.types,
      },
      results: merged,
    });
  } catch (err) {
    return jsonError(err);
  }
}
