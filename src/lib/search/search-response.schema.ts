import * as z from "zod/mini";

import { SEARCH_SCOPES, SEARCH_TYPE_FILTERS } from "@/lib/search/types";

const searchScopeSchema = z.enum(SEARCH_SCOPES);
const searchTypeFilterSchema = z.enum(SEARCH_TYPE_FILTERS);

const projectResultSchema = z.strictObject({
  href: z.string(),
  id: z.string(),
  title: z.string(),
  type: z.literal("project"),
});

const uploadResultSchema = z.strictObject({
  href: z.string(),
  id: z.string(),
  provenance: z.strictObject({
    mimeType: z.string(),
    projectId: z.string(),
    sizeBytes: z.number(),
  }),
  snippet: z.string(),
  title: z.string(),
  type: z.literal("upload"),
});

const chunkResultSchema = z.strictObject({
  href: z.string(),
  id: z.string(),
  provenance: z.strictObject({
    chunkIndex: z.number(),
    fileId: z.string(),
    pageEnd: z.exactOptional(z.number()),
    pageStart: z.exactOptional(z.number()),
    projectId: z.string(),
  }),
  score: z.number(),
  snippet: z.string(),
  title: z.string(),
  type: z.literal("chunk"),
});

const artifactResultSchema = z.strictObject({
  href: z.string(),
  id: z.string(),
  provenance: z.strictObject({
    artifactId: z.string(),
    kind: z.string(),
    logicalKey: z.string(),
    projectId: z.string(),
    version: z.number(),
  }),
  score: z.number(),
  snippet: z.string(),
  title: z.string(),
  type: z.literal("artifact"),
});

const runResultSchema = z.strictObject({
  href: z.string(),
  id: z.string(),
  provenance: z.strictObject({
    kind: z.enum(["research", "implementation"]),
    projectId: z.string(),
    status: z.enum([
      "pending",
      "running",
      "waiting",
      "blocked",
      "succeeded",
      "failed",
      "canceled",
    ]),
  }),
  snippet: z.string(),
  title: z.string(),
  type: z.literal("run"),
});

export const searchResultSchema = z.discriminatedUnion("type", [
  projectResultSchema,
  uploadResultSchema,
  chunkResultSchema,
  artifactResultSchema,
  runResultSchema,
]);

export const searchResponseSchema = z.strictObject({
  meta: z.strictObject({
    cursor: z.nullable(z.string()),
    limit: z.number(),
    nextCursor: z.nullable(z.string()),
    scope: searchScopeSchema,
    types: z.array(searchTypeFilterSchema),
  }),
  results: z.array(searchResultSchema),
});

export type SearchResponseSchema = z.infer<typeof searchResponseSchema>;
