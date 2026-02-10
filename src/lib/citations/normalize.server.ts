import "server-only";

import { z } from "zod";

import { budgets } from "@/lib/config/budgets.server";
import { isHttpOrHttpsUrl } from "@/lib/urls/safe-http-url";

const safeHttpUrlSchema = z
  .string()
  .trim()
  .pipe(z.url())
  .refine((value) => isHttpOrHttpsUrl(value), {
    message: "Unsupported URL protocol.",
  });

/**
 * Canonical citation payload stored in `citations.payload`.
 */
export const webCitationPayloadSchema = z.looseObject({
  accessedAt: z.string().min(1),
  author: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  excerpt: z.string().min(1).optional(),
  index: z.number().int().min(1),
  publishedDate: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  tool: z.enum(["exa", "firecrawl"]).optional(),
  url: safeHttpUrlSchema,
});

/**
 * Citation insertion input consumed by `createArtifactVersion`.
 */
export type CitationInput = Readonly<{
  sourceType: string;
  sourceRef: string;
  payload: Record<string, unknown>;
}>;

/**
 * Web citation source inputs accepted for normalization.
 *
 * @remarks
 * These inputs are deduped by URL and assigned stable 1-based indices during normalization.
 */
export type WebCitationSource = Readonly<{
  url: string;
  title: string | null;
  description: string | null;
  excerpt?: string | undefined;
  author?: string | undefined;
  publishedDate?: string | undefined;
  tool?: "exa" | "firecrawl" | undefined;
}>;

/**
 * Build citation inputs for web sources with stable 1-based indices.
 *
 * @param sources - Web sources.
 * @param options - Optional limits.
 * @returns Citation inputs (deduped by URL, limited by budget).
 */
export function normalizeWebCitations(
  sources: readonly WebCitationSource[],
  options: Readonly<{ maxCitations?: number }> = {},
): readonly CitationInput[] {
  const max = Math.min(
    Math.max(options.maxCitations ?? budgets.maxCitationsPerArtifact, 1),
    budgets.maxCitationsPerArtifact,
  );

  const byUrl = new Map<string, WebCitationSource>();
  for (const source of sources) {
    if (!source.url) continue;
    if (byUrl.size >= max) break;

    // Normalize early so dedupe + persisted `sourceRef` are canonical.
    const normalizedUrl = safeHttpUrlSchema.parse(source.url);
    if (!byUrl.has(normalizedUrl)) {
      byUrl.set(normalizedUrl, { ...source, url: normalizedUrl });
    }
  }

  const deduped = Array.from(byUrl.values()).slice(0, max);
  const accessedAt = new Date().toISOString();

  return deduped.map((s, i) => {
    const payload = webCitationPayloadSchema.parse({
      accessedAt,
      author: s.author,
      description: s.description ?? undefined,
      excerpt: s.excerpt,
      index: i + 1,
      publishedDate: s.publishedDate,
      title: s.title ?? undefined,
      tool: s.tool,
      url: s.url,
    });

    return {
      payload,
      sourceRef: s.url,
      sourceType: "web",
    };
  });
}
