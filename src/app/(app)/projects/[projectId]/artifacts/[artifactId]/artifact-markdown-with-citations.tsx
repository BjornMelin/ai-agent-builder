"use client";

import type { ComponentProps } from "react";

import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationQuote,
  InlineCitationSource,
} from "@/components/ai-elements/inline-citation";
import { MessageResponse } from "@/components/ai-elements/message";
import { HoverCardTrigger } from "@/components/ui/hover-card";
import { normalizeHttpOrHttpsUrl } from "@/lib/urls/safe-http-url";
import { cn } from "@/lib/utils";

type CitationDto = Readonly<{
  sourceType: string;
  payload: Record<string, unknown>;
}>;

type WebCitationPayload = Readonly<{
  index: number;
  url: string;
  title?: string;
  description?: string;
  excerpt?: string;
}>;

const CITATION_HREF_PATTERN = /^citation:(\d+)$/;

type AnchorProps = ComponentProps<"a"> & { node?: unknown };

function normalizeOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseWebCitationPayload(payload: unknown): WebCitationPayload | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }

  const record = payload as Record<string, unknown>;

  const index = record.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 1) {
    return null;
  }

  const url = normalizeHttpOrHttpsUrl(record.url);
  if (!url) return null;

  const title = normalizeOptionalNonEmptyString(record.title);
  const description = normalizeOptionalNonEmptyString(record.description);
  const excerpt = normalizeOptionalNonEmptyString(record.excerpt);

  return {
    index,
    url,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(excerpt ? { excerpt } : {}),
  };
}

function buildCitationIndex(citations: readonly CitationDto[]) {
  const byIndex = new Map<
    number,
    Readonly<{
      url: string;
      title?: string;
      description?: string;
      excerpt?: string;
    }>
  >();

  for (const citation of citations) {
    if (citation.sourceType !== "web") continue;
    const parsed = parseWebCitationPayload(citation.payload);
    if (!parsed) continue;
    byIndex.set(parsed.index, {
      url: parsed.url,
      ...(parsed.title ? { title: parsed.title } : {}),
      ...(parsed.description ? { description: parsed.description } : {}),
      ...(parsed.excerpt ? { excerpt: parsed.excerpt } : {}),
    });
  }

  return byIndex;
}

function CitationLink(
  props: Readonly<
    AnchorProps & {
      citations: Map<
        number,
        Readonly<{
          url: string;
          title?: string;
          description?: string;
          excerpt?: string;
        }>
      >;
    }
  >,
) {
  const { href, className, citations, ...rest } = props;
  const match =
    typeof href === "string" ? CITATION_HREF_PATTERN.exec(href) : null;
  if (!match) {
    return <a className={className} href={href} {...rest} />;
  }

  const index = Number.parseInt(match[1] ?? "", 10);
  const source = Number.isFinite(index) ? citations.get(index) : undefined;

  if (!source) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-muted-foreground text-xs tabular-nums",
          className,
        )}
      >
        [{Number.isFinite(index) ? index : "?"}]
      </span>
    );
  }

  return (
    <InlineCitation className={className}>
      <InlineCitationCard>
        <HoverCardTrigger asChild>
          <a
            className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 font-medium text-xs tabular-nums transition-colors hover:bg-secondary/70"
            href={source.url}
            rel="noreferrer noopener"
            target="_blank"
          >
            [{index}]
          </a>
        </HoverCardTrigger>
        <InlineCitationCardBody>
          <div className="space-y-3 p-4">
            <InlineCitationSource
              title={source.title ?? `Source ${index}`}
              url={source.url}
              {...(source.description
                ? { description: source.description }
                : {})}
            />
            {source.excerpt ? (
              <InlineCitationQuote>{source.excerpt}</InlineCitationQuote>
            ) : null}
            <div>
              <a
                className="text-sm underline-offset-4 hover:underline"
                href={source.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                Open source
              </a>
            </div>
          </div>
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  );
}

/**
 * Render artifact markdown with inline citations (citation:n links).
 *
 * @param props - Renderer props.
 * @returns Streamdown-rendered markdown with citation hover cards.
 */
export function ArtifactMarkdownWithCitations(
  props: Readonly<{
    markdown: string;
    citations: readonly CitationDto[];
  }>,
) {
  const citationIndex = buildCitationIndex(props.citations);

  return (
    <MessageResponse
      components={{
        a: (anchorProps) => (
          <CitationLink citations={citationIndex} {...anchorProps} />
        ),
      }}
    >
      {props.markdown}
    </MessageResponse>
  );
}
