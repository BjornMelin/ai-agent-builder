"use client";

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import { Badge } from "@/components/ui/badge";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

const getSourceLabel = (source: string) => {
  try {
    return new URL(source).hostname;
  } catch {
    return source || "unknown";
  }
};

export type InlineCitationProps = ComponentProps<"span">;

/**
 * Renders the inline citation wrapper.
 *
 * @param props - Citation wrapper props.
 * @returns The citation wrapper element.
 */
export const InlineCitation = (props: InlineCitationProps) => {
  const { className, ...rest } = props;
  return (
    <span
      className={cn("group inline items-center gap-1", className)}
      {...rest}
    />
  );
};

export type InlineCitationTextProps = ComponentProps<"span">;

/**
 * Renders citation-linked inline text.
 *
 * @param props - Text span props.
 * @returns The citation text element.
 */
export const InlineCitationText = (props: InlineCitationTextProps) => {
  const { className, ...rest } = props;
  return (
    <span
      className={cn("transition-colors group-hover:bg-accent", className)}
      {...rest}
    />
  );
};

export type InlineCitationCardProps = ComponentProps<typeof HoverCard>;

/**
 * Renders the hover card root for citation details.
 *
 * @param props - Hover card props.
 * @returns The citation hover card.
 */
export const InlineCitationCard = (props: InlineCitationCardProps) => (
  <HoverCard closeDelay={0} openDelay={0} {...props} />
);

export type InlineCitationCardTriggerProps = ComponentProps<typeof Badge> & {
  sources: string[];
};

/**
 * Renders the citation trigger badge.
 *
 * @param props - Trigger badge props and source list.
 * @returns The citation trigger.
 */
export const InlineCitationCardTrigger = (
  props: InlineCitationCardTriggerProps,
) => {
  const { sources, className, ...rest } = props;
  return (
    <HoverCardTrigger asChild>
      <Badge
        className={cn("ml-1 rounded-full", className)}
        variant="secondary"
        {...rest}
      >
        {sources[0] ? (
          <>
            {getSourceLabel(sources[0])}{" "}
            {sources.length > 1 && `+${sources.length - 1}`}
          </>
        ) : (
          "unknown"
        )}
      </Badge>
    </HoverCardTrigger>
  );
};

export type InlineCitationCardBodyProps = ComponentProps<"div">;

/**
 * Renders hover card content for citations.
 *
 * @param props - Card body props.
 * @returns The citation card body.
 */
export const InlineCitationCardBody = (props: InlineCitationCardBodyProps) => {
  const { className, ...rest } = props;
  return (
    <HoverCardContent
      className={cn("relative w-80 p-0", className)}
      {...rest}
    />
  );
};

const CarouselApiContext = createContext<CarouselApi | undefined>(undefined);

const useCarouselApi = () => {
  const context = useContext(CarouselApiContext);
  return context;
};

export type InlineCitationCarouselProps = ComponentProps<typeof Carousel>;

/**
 * Renders a carousel for multiple citation sources.
 *
 * @param props - Carousel props.
 * @returns The citation carousel.
 */
export const InlineCitationCarousel = (props: InlineCitationCarouselProps) => {
  const { className, children, ...rest } = props;
  const [api, setApi] = useState<CarouselApi>();

  return (
    <CarouselApiContext.Provider value={api}>
      <Carousel className={cn("w-full", className)} setApi={setApi} {...rest}>
        {children}
      </Carousel>
    </CarouselApiContext.Provider>
  );
};

export type InlineCitationCarouselContentProps = ComponentProps<
  typeof CarouselContent
>;

/**
 * Renders carousel track content for citation cards.
 *
 * @param props - Carousel content props.
 * @returns The carousel content.
 */
export const InlineCitationCarouselContent = (
  props: InlineCitationCarouselContentProps,
) => <CarouselContent {...props} />;

export type InlineCitationCarouselItemProps = ComponentProps<
  typeof CarouselItem
>;

/**
 * Renders one carousel item for a citation source.
 *
 * @param props - Carousel item props.
 * @returns The carousel item.
 */
export const InlineCitationCarouselItem = (
  props: InlineCitationCarouselItemProps,
) => {
  const { className, ...rest } = props;
  return (
    <CarouselItem
      className={cn("w-full space-y-2 p-4 pl-8", className)}
      {...rest}
    />
  );
};

export type InlineCitationCarouselHeaderProps = ComponentProps<"div">;

/**
 * Renders the citation carousel header row.
 *
 * @param props - Header props.
 * @returns The carousel header.
 */
export const InlineCitationCarouselHeader = (
  props: InlineCitationCarouselHeaderProps,
) => {
  const { className, ...rest } = props;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-t-md bg-secondary p-2",
        className,
      )}
      {...rest}
    />
  );
};

export type InlineCitationCarouselIndexProps = ComponentProps<"div">;

/**
 * Renders the current citation page index.
 *
 * @param props - Index props.
 * @returns The carousel index display.
 */
export const InlineCitationCarouselIndex = (
  props: InlineCitationCarouselIndexProps,
) => {
  const { children, className, ...rest } = props;
  const api = useCarouselApi();
  const { current, count } = useSyncExternalStore(
    (onStoreChange) => {
      if (!api) {
        return () => {};
      }
      api.on("select", onStoreChange);
      api.on("reInit", onStoreChange);
      return () => {
        api.off("select", onStoreChange);
        api.off("reInit", onStoreChange);
      };
    },
    () => ({
      count: api?.scrollSnapList().length ?? 0,
      current: (api?.selectedScrollSnap() ?? -1) + 1,
    }),
  );

  return (
    <div
      className={cn(
        "flex flex-1 items-center justify-end px-3 py-1 text-muted-foreground text-xs",
        className,
      )}
      {...rest}
    >
      {children ?? `${current}/${count}`}
    </div>
  );
};

export type InlineCitationCarouselPrevProps = ComponentProps<"button">;

/**
 * Renders the previous citation navigation button.
 *
 * @param props - Previous button props.
 * @returns The previous button.
 */
export const InlineCitationCarouselPrev = (
  props: InlineCitationCarouselPrevProps,
) => {
  const { className, ...rest } = props;
  const api = useCarouselApi();

  const handleClick = () => {
    api?.scrollPrev();
  };

  return (
    <button
      aria-label="Previous"
      className={cn("shrink-0", className)}
      onClick={handleClick}
      type="button"
      {...rest}
    >
      <ArrowLeftIcon className="size-4 text-muted-foreground" />
    </button>
  );
};

export type InlineCitationCarouselNextProps = ComponentProps<"button">;

/**
 * Renders the next citation navigation button.
 *
 * @param props - Next button props.
 * @returns The next button.
 */
export const InlineCitationCarouselNext = (
  props: InlineCitationCarouselNextProps,
) => {
  const { className, ...rest } = props;
  const api = useCarouselApi();

  const handleClick = () => {
    api?.scrollNext();
  };

  return (
    <button
      aria-label="Next"
      className={cn("shrink-0", className)}
      onClick={handleClick}
      type="button"
      {...rest}
    >
      <ArrowRightIcon className="size-4 text-muted-foreground" />
    </button>
  );
};

export type InlineCitationSourceProps = ComponentProps<"div"> & {
  title?: string;
  url?: string;
  description?: string;
};

/**
 * Renders citation source metadata content.
 *
 * @param props - Source metadata and container props.
 * @returns The citation source block.
 */
export const InlineCitationSource = (props: InlineCitationSourceProps) => {
  const { title, url, description, className, children, ...rest } = props;
  return (
    <div className={cn("space-y-1", className)} {...rest}>
      {title ? (
        <h4 className="truncate font-medium text-sm leading-tight">{title}</h4>
      ) : null}
      {url ? (
        <p className="truncate break-all text-muted-foreground text-xs">
          {url}
        </p>
      ) : null}
      {description ? (
        <p className="line-clamp-3 text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
};

export type InlineCitationQuoteProps = ComponentProps<"blockquote">;

/**
 * Renders a quoted excerpt from a source.
 *
 * @param props - Quote block props.
 * @returns The citation quote element.
 */
export const InlineCitationQuote = (props: InlineCitationQuoteProps) => {
  const { children, className, ...rest } = props;
  return (
    <blockquote
      className={cn(
        "border-muted border-l-2 pl-3 text-muted-foreground text-sm italic",
        className,
      )}
      {...rest}
    >
      {children}
    </blockquote>
  );
};
