"use client";

import {
  BrainIcon,
  ChevronDownIcon,
  DotIcon,
  type LucideIcon,
} from "lucide-react";
import { useControllableState } from "radix-ui/internal";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ChainOfThoughtContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
  null,
);

const useChainOfThought = () => {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error(
      "ChainOfThought components must be used within ChainOfThought",
    );
  }
  return context;
};

/** Props for the ChainOfThought component. */
export type ChainOfThoughtProps = ComponentProps<"div"> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Renders a collapsible chain-of-thought container with shared state.
 *
 * @param props - Container props including open state controls.
 * @returns A chain-of-thought container element.
 */
export const ChainOfThought = memo((props: ChainOfThoughtProps) => {
  const {
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    children,
    ...rest
  } = props;
  const [isOpen, setIsOpen] = useControllableState({
    defaultProp: defaultOpen,
    prop: open,
    ...(onOpenChange === undefined ? {} : { onChange: onOpenChange }),
  });

  const chainOfThoughtContext: ChainOfThoughtContextValue = {
    isOpen,
    setIsOpen,
  };

  return (
    <ChainOfThoughtContext.Provider value={chainOfThoughtContext}>
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <div className={cn("not-prose w-full space-y-4", className)} {...rest}>
          {children}
        </div>
      </Collapsible>
    </ChainOfThoughtContext.Provider>
  );
});

/** Props for the ChainOfThoughtHeader component. */
export type ChainOfThoughtHeaderProps = ComponentProps<
  typeof CollapsibleTrigger
>;

/**
 * Renders the chain-of-thought header trigger.
 *
 * @param props - Trigger props and optional children.
 * @returns A header trigger element.
 */
export const ChainOfThoughtHeader = memo((props: ChainOfThoughtHeaderProps) => {
  const { className, children, ...rest } = props;
  const { isOpen } = useChainOfThought();

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
        className,
      )}
      {...rest}
    >
      <BrainIcon className="size-4" />
      <span className="flex-1 text-left">{children ?? "Chain of Thought"}</span>
      <ChevronDownIcon
        className={cn(
          "size-4 transition-transform",
          isOpen ? "rotate-180" : "rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
});

/** Props for the ChainOfThoughtStep component. */
export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  status?: "complete" | "active" | "pending";
};

/**
 * Renders a single chain-of-thought step.
 *
 * @param props - Step props including label, description, and status.
 * @returns A chain-of-thought step element.
 */
export const ChainOfThoughtStep = memo((props: ChainOfThoughtStepProps) => {
  const {
    className,
    icon: Icon = DotIcon,
    label,
    description,
    status = "complete",
    children,
    ...rest
  } = props;
  const statusStyles = {
    active: "text-foreground",
    complete: "text-muted-foreground",
    pending: "text-muted-foreground/50",
  };

  return (
    <div
      className={cn(
        "flex gap-2 text-sm",
        statusStyles[status],
        "motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 motion-safe:animate-in motion-reduce:animate-none motion-reduce:transition-none",
        className,
      )}
      {...rest}
    >
      <div className="relative mt-0.5">
        <Icon className="size-4" />
        <div className="absolute top-7 bottom-0 left-1/2 -mx-px w-px bg-border" />
      </div>
      <div className="flex-1 space-y-2 overflow-hidden">
        <div>{label}</div>
        {description ? (
          <div className="text-muted-foreground text-xs">{description}</div>
        ) : null}
        {children}
      </div>
    </div>
  );
});

/** Props for the ChainOfThoughtSearchResults component. */
export type ChainOfThoughtSearchResultsProps = ComponentProps<"div">;

/**
 * Renders a container for search result badges.
 *
 * @param props - Div props for the results container.
 * @returns A results container element.
 */
export const ChainOfThoughtSearchResults = memo(
  (props: ChainOfThoughtSearchResultsProps) => {
    const { className, ...rest } = props;
    return (
      <div
        className={cn("flex flex-wrap items-center gap-2", className)}
        {...rest}
      />
    );
  },
);

/** Props for the ChainOfThoughtSearchResult component. */
export type ChainOfThoughtSearchResultProps = ComponentProps<typeof Badge>;

/**
 * Renders a single search result badge.
 *
 * @param props - Badge props and optional children.
 * @returns A badge element.
 */
export const ChainOfThoughtSearchResult = memo(
  (props: ChainOfThoughtSearchResultProps) => {
    const { className, children, ...rest } = props;
    return (
      <Badge
        className={cn("gap-1 px-2 py-0.5 font-normal text-xs", className)}
        variant="secondary"
        {...rest}
      >
        {children}
      </Badge>
    );
  },
);

/** Props for the ChainOfThoughtContent component. */
export type ChainOfThoughtContentProps = ComponentProps<
  typeof CollapsibleContent
>;

/**
 * Renders the collapsible content for chain-of-thought steps.
 *
 * @param props - Collapsible content props and optional children.
 * @returns A collapsible content element.
 */
export const ChainOfThoughtContent = memo(
  (props: ChainOfThoughtContentProps) => {
    const { className, children, ...rest } = props;
    const { isOpen } = useChainOfThought();

    return (
      <CollapsibleContent
        className={cn(
          "mt-2 space-y-3",
          "text-popover-foreground outline-none motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:slide-out-to-top-2 motion-safe:data-[state=open]:slide-in-from-top-2 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:animate-in motion-reduce:animate-none motion-reduce:transition-none",
          className,
        )}
        data-open={isOpen ? "true" : "false"}
        {...rest}
      >
        {children}
      </CollapsibleContent>
    );
  },
);

/** Props for the ChainOfThoughtImage component. */
export type ChainOfThoughtImageProps = ComponentProps<"div"> & {
  caption?: string;
};

/**
 * Renders an image block with an optional caption.
 *
 * @param props - Image container props including caption.
 * @returns An image container element.
 */
export const ChainOfThoughtImage = memo((props: ChainOfThoughtImageProps) => {
  const { className, children, caption, ...rest } = props;
  return (
    <div className={cn("mt-2 space-y-2", className)} {...rest}>
      <div className="relative flex max-h-[22rem] items-center justify-center overflow-hidden rounded-lg bg-muted p-3">
        {children}
      </div>
      {caption ? (
        <p className="text-muted-foreground text-xs">{caption}</p>
      ) : null}
    </div>
  );
});

ChainOfThought.displayName = "ChainOfThought";
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";
ChainOfThoughtSearchResults.displayName = "ChainOfThoughtSearchResults";
ChainOfThoughtSearchResult.displayName = "ChainOfThoughtSearchResult";
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";
ChainOfThoughtImage.displayName = "ChainOfThoughtImage";
