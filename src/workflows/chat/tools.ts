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
import {
  skillsLoadStep,
  skillsReadFileStep,
} from "@/workflows/chat/steps/skills.step";
import { webExtractStep } from "@/workflows/chat/steps/web-extract.step";
import { webSearchStep } from "@/workflows/chat/steps/web-search.step";

const ISO_DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

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
  endPublishedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  excludeDomains: z.array(z.string().min(1)).max(20).optional(),
  includeDomains: z.array(z.string().min(1)).max(20).optional(),
  numResults: z
    .number()
    .int()
    .min(1)
    .max(budgets.maxWebSearchResults)
    .optional(),
  query: z.string().min(1),
  startPublishedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

type WebSearchToolInput = Readonly<{
  query: string;
  numResults?: number | undefined;
  includeDomains?: readonly string[] | undefined;
  excludeDomains?: readonly string[] | undefined;
  startPublishedDate?: string | undefined;
  endPublishedDate?: string | undefined;
}>;

const webSearchTool = tool({
  description:
    "Search the web for relevant sources. Use this to find authoritative pages before extracting them.",
  execute: webSearchStep,
  inputSchema: jsonSchema<WebSearchToolInput>(
    {
      additionalProperties: false,
      properties: {
        endPublishedDate: {
          pattern: ISO_DATE_PATTERN,
          type: "string",
        },
        excludeDomains: {
          items: { minLength: 1, type: "string" },
          maxItems: 20,
          type: "array",
        },
        includeDomains: {
          items: { minLength: 1, type: "string" },
          maxItems: 20,
          type: "array",
        },
        numResults: {
          maximum: budgets.maxWebSearchResults,
          minimum: 1,
          type: "integer",
        },
        query: { minLength: 1, type: "string" },
        startPublishedDate: {
          pattern: ISO_DATE_PATTERN,
          type: "string",
        },
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
  maxChars: z
    .number()
    .int()
    .min(1)
    .max(budgets.maxWebExtractCharsPerUrl)
    .optional(),
  url: z.string().min(1),
});

type WebExtractToolInput = Readonly<{
  url: string;
  maxChars?: number | undefined;
}>;

const webExtractTool = tool({
  description:
    "Extract the main content of a web page as markdown. Use this after web.search to read sources.",
  execute: webExtractStep,
  inputSchema: jsonSchema<WebExtractToolInput>(
    {
      additionalProperties: false,
      properties: {
        maxChars: {
          maximum: budgets.maxWebExtractCharsPerUrl,
          minimum: 1,
          type: "integer",
        },
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

const skillsLoadInput = z.strictObject({
  name: z.string().min(1),
});

type SkillsLoadToolInput = Readonly<{
  name: string;
}>;

const skillsLoadTool = tool({
  description:
    "Load a skill to get specialized instructions. Use this when a request matches an available skill description.",
  execute: skillsLoadStep,
  inputSchema: jsonSchema<SkillsLoadToolInput>(
    {
      additionalProperties: false,
      properties: {
        name: { minLength: 1, type: "string" },
      },
      required: ["name"],
      type: "object",
    } satisfies JSONSchema7,
    {
      validate: (value) => {
        const parsed = skillsLoadInput.safeParse(value);
        return parsed.success
          ? { success: true, value: parsed.data }
          : { error: parsed.error, success: false };
      },
    },
  ),
});

const skillsReadFileInput = z.strictObject({
  name: z.string().min(1),
  path: z.string().min(1),
});

type SkillsReadFileToolInput = Readonly<{
  name: string;
  path: string;
}>;

const skillsReadFileTool = tool({
  description:
    "Read a file referenced by a repo-bundled skill (e.g. references/*, assets/*, scripts/*). Path must be relative to the skill directory.",
  execute: skillsReadFileStep,
  inputSchema: jsonSchema<SkillsReadFileToolInput>(
    {
      additionalProperties: false,
      properties: {
        name: { minLength: 1, type: "string" },
        path: { minLength: 1, type: "string" },
      },
      required: ["name", "path"],
      type: "object",
    } satisfies JSONSchema7,
    {
      validate: (value) => {
        const parsed = skillsReadFileInput.safeParse(value);
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
  "skills.load": skillsLoadTool,
  "skills.readFile": skillsReadFileTool,
  "web.extract": webExtractTool,
  "web.search": webSearchTool,
} satisfies ToolSet;
