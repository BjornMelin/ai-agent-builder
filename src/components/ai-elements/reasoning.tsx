"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useEffect, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { StreamdownRenderer } from "./streamdown-renderer";

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

/**
 * Returns the reasoning context for child components.
 *
 * @returns The reasoning context value.
 * @throws Error if used outside of Reasoning.
 */
export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

/** Represents the state of the reasoning stream. */
export type ReasoningState = "idle" | "streaming";

/** Props for the Reasoning component. */
export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  state?: ReasoningState;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;

/**
 * Renders a collapsible reasoning panel with streaming behavior.
 *
 * @param props - Collapsible props including state and duration.
 * @returns A reasoning panel element.
 */
export const Reasoning = memo((props: ReasoningProps) => {
  const {
    className,
    state = "idle",
    open,
    defaultOpen = true,
    onOpenChange,
    duration: durationProp,
    children,
    ...rest
  } = props;
  const isStreaming = state === "streaming";
  const [isOpen, setIsOpen] = useControllableState({
    defaultProp: defaultOpen,
    prop: open,
    ...(onOpenChange === undefined ? {} : { onChange: onOpenChange }),
  });
  const duration = durationProp;

  const [hasAutoClosed, setHasAutoClosed] = useState(false);

  // Auto-open when streaming starts, auto-close when streaming ends (once only)
  useEffect(() => {
    if (defaultOpen && !isStreaming && isOpen && !hasAutoClosed) {
      // Add a small delay before closing to allow user to see the content
      const timer = setTimeout(() => {
        setIsOpen(false);
        setHasAutoClosed(true);
      }, AUTO_CLOSE_DELAY);

      return () => clearTimeout(timer);
    }
  }, [isStreaming, isOpen, defaultOpen, setIsOpen, hasAutoClosed]);

  const handleOpenChange = (newOpen: boolean) => {
    setIsOpen(newOpen);
  };

  return (
    <ReasoningContext.Provider
      value={{ duration, isOpen, isStreaming, setIsOpen }}
    >
      <Collapsible
        className={cn("not-prose mb-4", className)}
        onOpenChange={handleOpenChange}
        open={isOpen}
        {...rest}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
});

/** Props for the ReasoningTrigger component. */
export type ReasoningTriggerProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  getThinkingMessage?: (state: ReasoningState, duration?: number) => ReactNode;
};

const defaultGetThinkingMessage = (
  state: ReasoningState,
  duration?: number,
) => {
  if (state === "streaming" || duration === 0) return <p>Thinking…</p>;
  if (duration === undefined) {
    return <p>Thought for a few seconds</p>;
  }
  return <p>Thought for {duration} seconds</p>;
};

/**
 * Renders a trigger for the reasoning panel.
 *
 * @param props - Trigger props including optional message generator.
 * @returns A collapsible trigger element.
 */
export const ReasoningTrigger = memo((props: ReasoningTriggerProps) => {
  const {
    className,
    children,
    getThinkingMessage = defaultGetThinkingMessage,
    ...rest
  } = props;
  const { isStreaming, isOpen, duration } = useReasoning();

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
        className,
      )}
      {...rest}
    >
      {children ?? (
        <>
          <BrainIcon className="size-4" />
          {getThinkingMessage(isStreaming ? "streaming" : "idle", duration)}
          <ChevronDownIcon
            className={cn(
              "size-4 transition-transform",
              isOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </>
      )}
    </CollapsibleTrigger>
  );
});

/** Props for the ReasoningContent component. */
export type ReasoningContentProps = ComponentProps<
  typeof CollapsibleContent
> & {
  children: string;
};

/**
 * Renders the reasoning content body.
 *
 * @param props - Content props including the reasoning text.
 * @returns A collapsible content element.
 */
export const ReasoningContent = memo((props: ReasoningContentProps) => {
  const { className, children, ...rest } = props;
  return (
    <CollapsibleContent
      className={cn(
        "mt-4 text-sm",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        className,
      )}
      {...rest}
    >
      <StreamdownRenderer {...rest}>{children}</StreamdownRenderer>
    </CollapsibleContent>
  );
});

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
