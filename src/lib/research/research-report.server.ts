import "server-only";

import { generateText } from "ai";

import { getDefaultChatModel } from "@/lib/ai/gateway.server";
import { extractWebPage } from "@/lib/ai/tools/web-extract.server";
import { searchWeb } from "@/lib/ai/tools/web-search.server";
import {
  normalizeWebCitations,
  type WebCitationSource,
} from "@/lib/citations/normalize.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import { createArtifactVersion } from "@/lib/data/artifacts.server";

const MAX_SOURCE_CONTEXT_CHARS = 6_000;

function logicalKeyForQuery(query: string): string {
  const normalized = query.trim().toLowerCase();
  return `research-${sha256Hex(normalized).slice(0, 12)}`;
}

function titleForQuery(query: string): string {
  const trimmed = query.trim();
  const short = trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  return `Research report: ${short}`;
}

function truncateForContext(markdown: string): string {
  if (markdown.length <= MAX_SOURCE_CONTEXT_CHARS) return markdown;
  return `${markdown.slice(0, MAX_SOURCE_CONTEXT_CHARS)}\n\n… [truncated for context]`;
}

export type ResearchReportResult = Readonly<{
  artifactId: string;
  kind: string;
  logicalKey: string;
  title: string;
  version: number;
}>;

/**
 * Generate and persist a citation-backed research report artifact.
 *
 * @param input - Report generation input.
 * @returns Created artifact metadata.
 */
export async function createResearchReportArtifact(
  input: Readonly<{
    projectId: string;
    query: string;
    runId?: string | null;
    maxExtractUrls?: number | undefined;
  }>,
): Promise<ResearchReportResult> {
  const query = input.query.trim();
  if (query.length === 0) {
    throw new AppError("bad_request", 400, "Query must be non-empty.");
  }

  const search = await searchWeb({ query });
  const extractLimitRaw = input.maxExtractUrls ?? 3;
  const extractLimit = Math.min(
    Math.max(extractLimitRaw, 1),
    budgets.maxWebExtractCallsPerTurn,
  );
  const urls = search.results
    .map((r) => r.url)
    .filter((u) => typeof u === "string" && u.length > 0)
    .slice(0, extractLimit);

  const extracted = await Promise.all(
    urls.map(async (url) => await extractWebPage({ url })),
  );

  const webSources: WebCitationSource[] = extracted.map((e) => ({
    description: e.description,
    title: e.title,
    url: e.url,
    ...(e.publishedTime ? { publishedDate: e.publishedTime } : {}),
  }));

  const citations = normalizeWebCitations(webSources);

  const sourceContext = extracted
    .map((e, idx) => {
      const n = idx + 1;
      const title = e.title ?? e.url;
      return [
        `Source ${n}: ${title}`,
        e.url,
        "",
        truncateForContext(e.markdown),
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const system = [
    "You are a research writer.",
    "",
    "Output requirements:",
    "- Write a structured markdown research report.",
    "- Cite sources inline using the exact syntax `[[n]](citation:n)` where `n` is the source number provided.",
    "- Do not invent citations.",
    "- Keep quotes short; prefer paraphrase.",
  ].join("\n");

  const prompt = [
    `Research question: ${query}`,
    "",
    "Use the sources below. Source numbers map to citation numbers.",
    "",
    sourceContext,
  ].join("\n");

  const model = getDefaultChatModel();
  const { text } = await generateText({
    model,
    prompt,
    system,
  });

  const title = titleForQuery(query);
  const logicalKey = logicalKeyForQuery(query);

  const artifact = await createArtifactVersion({
    citations,
    content: { format: "markdown", markdown: text, title },
    kind: "RESEARCH_REPORT",
    logicalKey,
    projectId: input.projectId,
    runId: input.runId ?? null,
  });

  return {
    artifactId: artifact.id,
    kind: artifact.kind,
    logicalKey: artifact.logicalKey,
    title,
    version: artifact.version,
  };
}
