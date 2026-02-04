"use client";

import { BookIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/** Props for the Sources component. */
export type SourcesProps = ComponentProps<"div">;

/**
 * Renders a collapsible container for sources.
 *
 * @param props - Div props for the sources container.
 * @returns A collapsible sources element.
 */
export const Sources = (props: SourcesProps) => {
  const { className, ...rest } = props;
  return (
    <Collapsible
      className={cn("not-prose mb-4 text-primary text-xs", className)}
      {...rest}
    />
  );
};

/** Props for the SourcesTrigger component. */
export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

/**
 * Renders the trigger for showing or hiding sources.
 *
 * @param props - Trigger props including source count.
 * @returns A collapsible trigger element.
 */
export const SourcesTrigger = (props: SourcesTriggerProps) => {
  const { className, count, children, ...rest } = props;
  return (
    <CollapsibleTrigger
      className={cn("flex items-center gap-2", className)}
      {...rest}
    >
      {children ?? (
        <>
          <p className="font-medium">Used {count} sources</p>
          <ChevronDownIcon className="h-4 w-4" />
        </>
      )}
    </CollapsibleTrigger>
  );
};

/** Props for the SourcesContent component. */
export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

/**
 * Renders the content area containing source links.
 *
 * @param props - Collapsible content props.
 * @returns A collapsible content element.
 */
export const SourcesContent = (props: SourcesContentProps) => {
  const { className, ...rest } = props;
  return (
    <CollapsibleContent
      className={cn(
        "mt-3 flex w-fit flex-col gap-2",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the Source component. */
export type SourceProps = ComponentProps<"a">;

/**
 * Renders a source link that opens in a new tab.
 *
 * @param props - Anchor props including href and title.
 * @returns A source link element.
 */
export const Source = (props: SourceProps) => {
  const { href, title, children, ...rest } = props;
  const ariaLabel =
    rest["aria-label"] ?? `${title ?? href ?? "Source"} (opens in a new tab)`;
  return (
    <a
      className="flex items-center gap-2"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      aria-label={ariaLabel}
      {...rest}
    >
      {children ?? (
        <>
          <BookIcon className="h-4 w-4" />
          <span className="block font-medium">{title}</span>
        </>
      )}
    </a>
  );
};
