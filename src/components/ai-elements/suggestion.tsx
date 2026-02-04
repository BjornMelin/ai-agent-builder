"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** Props for the horizontally scrollable suggestions container. */
export type SuggestionsProps = ComponentProps<typeof ScrollArea>;

/**
 * Renders a horizontally scrollable container for suggestion chips.
 *
 * @param props - Props forwarded to `ScrollArea`.
 * @returns A scrollable suggestions row.
 */
export const Suggestions = (props: SuggestionsProps) => {
  const { className, children, ...rest } = props;

  return (
    <ScrollArea className="w-full overflow-x-auto whitespace-nowrap" {...rest}>
      <div
        className={cn("flex w-max flex-nowrap items-center gap-2", className)}
      >
        {children}
      </div>
      <ScrollBar className="hidden" orientation="horizontal" />
    </ScrollArea>
  );
};

/** Props for a single clickable suggestion chip. */
export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

/**
 * Renders a single suggestion button and reports the suggestion value on click.
 *
 * @param props - Suggestion content and button props.
 * @returns A suggestion button element.
 */
export const Suggestion = (props: SuggestionProps) => {
  const {
    suggestion,
    onClick,
    className,
    variant = "outline",
    size = "sm",
    children,
    ...rest
  } = props;

  const handleClick = () => {
    onClick?.(suggestion);
  };

  return (
    <Button
      className={cn("cursor-pointer rounded-full px-4", className)}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...rest}
    >
      {children || suggestion}
    </Button>
  );
};
