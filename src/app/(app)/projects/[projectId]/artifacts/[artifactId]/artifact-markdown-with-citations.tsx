"use client";

import type { ComponentProps } from "react";
import { z } from "zod";

import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationSource,
} from "@/components/ai-elements/inline-citation";
import { MessageResponse } from "@/components/ai-elements/message";
import { HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

type CitationDto = Readonly<{
  id: string;
  sourceType: string;
  sourceRef: string;
  payload: Record<string, unknown>;
}>;

const webCitationPayloadSchema = z
  .object({
    description: z.string().min(1).optional(),
    index: z.number().int().min(1),
    title: z.string().min(1).optional(),
    url: z.string().url(),
  })
  .passthrough();

const CITATION_HREF_PATTERN = /^citation:(\d+)$/;

type AnchorProps = ComponentProps<"a"> & { node?: unknown };

function buildCitationIndex(citations: readonly CitationDto[]) {
  const byIndex = new Map<
    number,
    Readonly<{ url: string; title?: string; description?: string }>
  >();

  for (const citation of citations) {
    if (citation.sourceType !== "web") continue;
    const parsed = webCitationPayloadSchema.safeParse(citation.payload);
    if (!parsed.success) continue;
    byIndex.set(parsed.data.index, {
      url: parsed.data.url,
      ...(typeof parsed.data.title === "string" && parsed.data.title.length > 0
        ? { title: parsed.data.title }
        : {}),
      ...(typeof parsed.data.description === "string" &&
      parsed.data.description.length > 0
        ? { description: parsed.data.description }
        : {}),
    });
  }

  return byIndex;
}

function CitationLink(
  props: Readonly<
    AnchorProps & {
      citations: Map<
        number,
        Readonly<{ url: string; title?: string; description?: string }>
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
