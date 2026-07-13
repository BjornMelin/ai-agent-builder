import type { ToolSet } from "ai";
import { tool } from "ai";
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
import {
  projectToolContextSchema,
  researchToolContextSchema,
} from "@/workflows/chat/tool-context";

const retrieveProjectChunksInput = z.strictObject({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(budgets.maxVectorTopK).optional(),
});

const webSearchInput = z.strictObject({
  endPublishedDate: z.iso.date().optional(),
  excludeDomains: z.array(z.string().min(1)).max(20).optional(),
  includeDomains: z.array(z.string().min(1)).max(20).optional(),
  numResults: z
    .number()
    .int()
    .min(1)
    .max(budgets.maxWebSearchResults)
    .optional(),
  query: z.string().min(1),
  startPublishedDate: z.iso.date().optional(),
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

const context7ResolveInput = z.strictObject({
  libraryName: z.string().min(1),
  query: z.string().min(1),
});

const context7QueryInput = z.strictObject({
  libraryId: z.string().min(1),
  query: z.string().min(1),
});

const researchReportInput = z.strictObject({
  query: z.string().min(1),
});

const skillsLoadInput = z.strictObject({
  name: z.string().min(1),
});

const skillsReadFileInput = z.strictObject({
  name: z.string().min(1),
  path: z.string().min(1),
});

/** Toolset for project-scoped chat. */
export const chatTools = {
  "context7.query-docs": tool({
    description: "Query Context7 docs for a libraryId.",
    execute: context7QueryDocsStep,
    inputSchema: context7QueryInput,
  }),
  "context7.resolve-library-id": tool({
    description:
      "Resolve a library/package name to a Context7 libraryId for documentation lookup.",
    execute: context7ResolveLibraryIdStep,
    inputSchema: context7ResolveInput,
  }),
  "research.create-report": tool({
    contextSchema: researchToolContextSchema,
    description:
      "Generate a citation-backed research report artifact for this project.",
    execute: createResearchReportStep,
    inputSchema: researchReportInput,
  }),
  retrieveProjectChunks: tool({
    contextSchema: projectToolContextSchema,
    description:
      "Retrieve the most relevant chunks from this project's knowledge base. Use this to ground answers in uploaded sources.",
    execute: retrieveProjectChunksStep,
    inputSchema: retrieveProjectChunksInput,
  }),
  "skills.load": tool({
    contextSchema: projectToolContextSchema,
    description:
      "Load a skill to get specialized instructions. Use this when a request matches an available skill description.",
    execute: skillsLoadStep,
    inputSchema: skillsLoadInput,
  }),
  "skills.readFile": tool({
    contextSchema: projectToolContextSchema,
    description:
      "Read a file referenced by a repo-bundled skill (e.g. references/*, assets/*, scripts/*). Path must be relative to the skill directory.",
    execute: skillsReadFileStep,
    inputSchema: skillsReadFileInput,
  }),
  "web.extract": tool({
    description:
      "Extract the main content of a web page as markdown. Use this after web.search to read sources.",
    execute: webExtractStep,
    inputSchema: webExtractInput,
  }),
  "web.search": tool({
    description:
      "Search the web for relevant sources. Use this to find authoritative pages before extracting them.",
    execute: webSearchStep,
    inputSchema: webSearchInput,
  }),
} satisfies ToolSet;
