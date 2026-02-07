import type { JSONSchema7 } from "@ai-sdk/provider";
import { jsonSchema, type ToolSet, tool } from "ai";
import { z } from "zod";
import { budgets } from "@/lib/config/budgets.server";
import {
  context7QueryDocsStep,
  context7ResolveLibraryIdStep,
} from "@/workflows/chat/steps/context7.step";
import { createResearchReportStep } from "@/workflows/chat/steps/research-report.step";
import { retrieveProjectChunksStep } from "@/workflows/chat/steps/retrieve-project-chunks.step";
import { webExtractStep } from "@/workflows/chat/steps/web-extract.step";
import { webSearchStep } from "@/workflows/chat/steps/web-search.step";

const retrieveProjectChunksInput = z.strictObject({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(budgets.maxVectorTopK).optional(),
});

type RetrieveProjectChunksToolInput = Readonly<{
  query: string;
  topK?: number | undefined;
}>;

const retrieveProjectChunksTool = tool({
  description:
    "Retrieve the most relevant chunks from this project's knowledge base. Use this to ground answers in uploaded sources.",
  execute: retrieveProjectChunksStep,
  inputSchema: jsonSchema<RetrieveProjectChunksToolInput>(
    {
      additionalProperties: false,
      properties: {
        query: { minLength: 1, type: "string" },
        topK: {
          maximum: budgets.maxVectorTopK,
          minimum: 1,
          type: "integer",
        },
      },
      required: ["query"],
      type: "object",
    } satisfies JSONSchema7,
    {
      validate: (value) => {
        const parsed = retrieveProjectChunksInput.safeParse(value);
        return parsed.success
          ? { success: true, value: parsed.data }
          : { error: parsed.error, success: false };
      },
    },
  ),
});

const webSearchInput = z.strictObject({
  numResults: z
    .number()
    .int()
    .min(1)
    .max(budgets.maxWebSearchResults)
    .optional(),
  query: z.string().min(1),
});

type WebSearchToolInput = Readonly<{
  query: string;
  numResults?: number | undefined;
}>;

const webSearchTool = tool({
  description:
    "Search the web for relevant sources. Use this to find authoritative pages before extracting them.",
  execute: webSearchStep,
  inputSchema: jsonSchema<WebSearchToolInput>(
    {
      additionalProperties: false,
      properties: {
        numResults: {
          maximum: budgets.maxWebSearchResults,
          minimum: 1,
          type: "integer",
        },
        query: { minLength: 1, type: "string" },
      },
      required: ["query"],
      type: "object",
    } satisfies JSONSchema7,
    {
      validate: (value) => {
        const parsed = webSearchInput.safeParse(value);
        return parsed.success
          ? { success: true, value: parsed.data }
          : { error: parsed.error, success: false };
      },
    },
  ),
});

const webExtractInput = z.strictObject({
  url: z.string().min(1),
});

type WebExtractToolInput = Readonly<{
  url: string;
}>;

const webExtractTool = tool({
  description:
    "Extract the main content of a web page as markdown. Use this after web.search to read sources.",
  execute: webExtractStep,
  inputSchema: jsonSchema<WebExtractToolInput>(
    {
      additionalProperties: false,
      properties: {
        url: { minLength: 1, type: "string" },
      },
      required: ["url"],
      type: "object",
    } satisfies JSONSchema7,
    {
      validate: (value) => {
        const parsed = webExtractInput.safeParse(value);
        return parsed.success
          ? { success: true, value: parsed.data }
          : { error: parsed.error, success: false };
      },
    },
  ),
});

const context7ResolveInput = z.strictObject({
  libraryName: z.string().min(1),
  query: z.string().min(1),
});

type Context7ResolveToolInput = Readonly<{
  libraryName: string;
  query: string;
}>;

const context7ResolveTool = tool({
  description:
    "Resolve a library/package name to a Context7 libraryId for documentation lookup.",
  execute: context7ResolveLibraryIdStep,
  inputSchema: jsonSchema<Context7ResolveToolInput>(
    {
      additionalProperties: false,
      properties: {
        libraryName: { minLength: 1, type: "string" },
        query: { minLength: 1, type: "string" },
      },
      required: ["libraryName", "query"],
      type: "object",
    } satisfies JSONSchema7,
    {
      validate: (value) => {
        const parsed = context7ResolveInput.safeParse(value);
        return parsed.success
          ? { success: true, value: parsed.data }
          : { error: parsed.error, success: false };
      },
    },
  ),
});

const context7QueryInput = z.strictObject({
  libraryId: z.string().min(1),
  query: z.string().min(1),
});

type Context7QueryToolInput = Readonly<{
  libraryId: string;
  query: string;
}>;

const context7QueryTool = tool({
  description: "Query Context7 docs for a libraryId.",
  execute: context7QueryDocsStep,
  inputSchema: jsonSchema<Context7QueryToolInput>(
    {
      additionalProperties: false,
      properties: {
        libraryId: { minLength: 1, type: "string" },
        query: { minLength: 1, type: "string" },
      },
      required: ["libraryId", "query"],
      type: "object",
    } satisfies JSONSchema7,
    {
      validate: (value) => {
        const parsed = context7QueryInput.safeParse(value);
        return parsed.success
          ? { success: true, value: parsed.data }
          : { error: parsed.error, success: false };
      },
    },
  ),
});

const researchReportInput = z.strictObject({
  query: z.string().min(1),
});

type ResearchReportToolInput = Readonly<{
  query: string;
}>;

const createResearchReportTool = tool({
  description:
    "Generate a citation-backed research report artifact for this project.",
  execute: createResearchReportStep,
  inputSchema: jsonSchema<ResearchReportToolInput>(
    {
      additionalProperties: false,
      properties: {
        query: { minLength: 1, type: "string" },
      },
      required: ["query"],
      type: "object",
    } satisfies JSONSchema7,
    {
      validate: (value) => {
        const parsed = researchReportInput.safeParse(value);
        return parsed.success
          ? { success: true, value: parsed.data }
          : { error: parsed.error, success: false };
      },
    },
  ),
});

/**
 * Toolset for project-scoped chat.
 */
export const chatTools = {
  "context7.query-docs": context7QueryTool,
  "context7.resolve-library-id": context7ResolveTool,
  "research.create-report": createResearchReportTool,
  retrieveProjectChunks: retrieveProjectChunksTool,
  "web.extract": webExtractTool,
  "web.search": webSearchTool,
} satisfies ToolSet;
