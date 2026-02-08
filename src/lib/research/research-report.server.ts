import "server-only";

import { generateText } from "ai";

import { getChatModelById } from "@/lib/ai/gateway.server";
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
  return `research-report:${sha256Hex(normalized)}`;
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

function excerptForMarkdown(markdown: string): string | undefined {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) return undefined;

  const maxChars = 280;
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars)}…` : cleaned;
}

function addAbortListener(
  signal: AbortSignal,
  onAbort: () => void,
): () => void {
  if (signal.aborted) {
    onAbort();
    return () => undefined;
  }

  signal.addEventListener("abort", onAbort, { once: true });
  return () => {
    signal.removeEventListener("abort", onAbort);
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal) return;
  if (!signal.aborted) return;
  throw new AppError("aborted", 499, "Operation aborted.", signal.reason);
}

/**
 * Metadata returned after creating a research report artifact.
 */
export type ResearchReportResult = Readonly<{
  /** Artifact ID. */
  artifactId: string;
  /** Artifact kind. */
  kind: string;
  /** Stable logical key used for artifact versioning. */
  logicalKey: string;
  /** User-facing artifact title. */
  title: string;
  /** Artifact version number. */
  version: number;
}>;

/**
 * Generate and persist a citation-backed research report artifact.
 *
 * @param input - Report generation input.
 * @returns Created artifact metadata.
 * @throws AppError - When the query is empty.
 */
export async function createResearchReportArtifact(
  input: Readonly<{
    projectId: string;
    query: string;
    modelId: string;
    runId?: string | null;
    maxExtractUrls?: number | undefined;
    abortSignal?: AbortSignal | undefined;
  }>,
): Promise<ResearchReportResult> {
  const query = input.query.trim();
  if (query.length === 0) {
    throw new AppError("bad_request", 400, "Query must be non-empty.");
  }

  throwIfAborted(input.abortSignal);
  const search = await searchWeb({ abortSignal: input.abortSignal, query });
  const extractLimitRaw = input.maxExtractUrls ?? 3;
  const extractLimit = Math.min(
    Math.max(extractLimitRaw, 1),
    budgets.maxWebExtractCallsPerTurn,
  );
  const urlsRaw = search.results
    .map((r) => r.url)
    .filter((u) => typeof u === "string" && u.length > 0)
    .slice(0, extractLimit * 2);

  // Dedupe URLs before extracting so source numbering stays aligned with stored citations.
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const url of urlsRaw) {
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= extractLimit) break;
  }

  throwIfAborted(input.abortSignal);
  const extracted = await Promise.all(
    urls.map(async (url) => {
      throwIfAborted(input.abortSignal);
      const result = await extractWebPage({
        abortSignal: input.abortSignal,
        url,
      });
      throwIfAborted(input.abortSignal);
      return result;
    }),
  );

  const sources = extracted.map((e) => ({
    url: e.url,
    ...(typeof e.title === "string" && e.title.trim().length > 0
      ? { title: e.title }
      : {}),
  }));

  const webSources: WebCitationSource[] = extracted.map((e) => ({
    description: e.description,
    excerpt: excerptForMarkdown(e.markdown),
    title: e.title,
    tool: "firecrawl",
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

  const model = getChatModelById(input.modelId);
  const generateController = new AbortController();
  let abortedByTimeout = false;
  const cleanupFns: Array<() => void> = [];

  if (input.abortSignal) {
    cleanupFns.push(
      addAbortListener(input.abortSignal, () => {
        generateController.abort(input.abortSignal?.reason);
      }),
    );
  }

  // Local safety timeout. Keep this slightly above other upstream budgets to avoid hanging forever.
  const timeoutMs = Math.max(budgets.webExtractTimeoutMs, 30_000) * 2;
  const timeoutId = setTimeout(() => {
    abortedByTimeout = true;
    generateController.abort(
      new Error("Research report generation timed out."),
    );
  }, timeoutMs);
  cleanupFns.push(() => clearTimeout(timeoutId));

  let text: string;
  try {
    const result = await generateText({
      abortSignal: generateController.signal,
      model,
      prompt,
      system,
    });
    text = result.text;
  } catch (error) {
    if (abortedByTimeout) {
      throw new AppError(
        "upstream_timeout",
        504,
        "Report generation timed out.",
      );
    }
    if (generateController.signal.aborted) {
      throw new AppError(
        "aborted",
        499,
        "Operation aborted.",
        generateController.signal.reason,
      );
    }
    throw error;
  } finally {
    for (const fn of cleanupFns) fn();
  }

  const title = titleForQuery(query);
  const logicalKey = logicalKeyForQuery(query);

  const artifact = await createArtifactVersion({
    citations,
    content: { format: "markdown", markdown: text, query, sources, title },
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
