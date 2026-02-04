"use client";

import { BookmarkIcon, type LucideProps } from "lucide-react";
import React, { type ComponentProps, type HTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Props for the Checkpoint component.
 * Extends HTMLAttributes<HTMLDivElement>.
 */
export type CheckpointProps = HTMLAttributes<HTMLDivElement>;

/**
 * A checkpoint component that renders children followed by a separator.
 * Used to visually group elements with a consistent divider.
 *
 * @param props - Component properties including className and children.
 * @returns The rendered checkpoint container with a separator.
 */
export const Checkpoint = (props: CheckpointProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 overflow-hidden text-muted-foreground",
        className,
      )}
      {...rest}
    >
      {children}
      <Separator />
    </div>
  );
};

/**
 * Props for the CheckpointIcon component.
 */
export type CheckpointIconProps = LucideProps & {
  children?: React.ReactNode;
};

/**
 * Renders the checkpoint icon, or custom children when provided.
 *
 * @param props - Lucide icon props and optional override children.
 * @returns The default bookmark icon or custom icon content.
 */
export const CheckpointIcon = (props: CheckpointIconProps) => {
  const { className, children, ...rest } = props;
  return (
    children ?? (
      <BookmarkIcon className={cn("size-4 shrink-0", className)} {...rest} />
    )
  );
};

/**
 * Props for the CheckpointTrigger component.
 */
export type CheckpointTriggerProps = ComponentProps<typeof Button> & {
  /** Optional tooltip text to display on hover. */
  tooltip?: string;
};

/**
 * A trigger button for checkpoints, optionally wrapped in a tooltip.
 *
 * @param props - Component properties. Includes children, className, variant (default: "ghost"), size (default: "sm"), and an optional tooltip.
 * @returns A Button component, wrapped in a Tooltip if the tooltip prop is provided.
 */
export const CheckpointTrigger = (props: CheckpointTriggerProps) => {
  const {
    children,
    className,
    variant = "ghost",
    size = "sm",
    tooltip,
    ...rest
  } = props;
  return tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className={className}
          size={size}
          type="button"
          variant={variant}
          {...rest}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent align="start" side="bottom">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  ) : (
    <Button
      className={className}
      size={size}
      type="button"
      variant={variant}
      {...rest}
    >
      {children}
    </Button>
  );
};
