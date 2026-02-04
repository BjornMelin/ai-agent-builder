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
export const Checkpoint = ({
  className,
  children,
  ...props
}: CheckpointProps) => (
  <div
    className={cn(
      "flex items-center gap-0.5 overflow-hidden text-muted-foreground",
      className,
    )}
    {...props}
  >
    {children}
    <Separator />
  </div>
);

/**
 * Props for the CheckpointIcon component.
 */
export type CheckpointIconProps = LucideProps & {
  children?: React.ReactNode;
};

export const CheckpointIcon = ({
  className,
  children,
  ...props
}: CheckpointIconProps) =>
  children ?? (
    <BookmarkIcon className={cn("size-4 shrink-0", className)} {...props} />
  );

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
export const CheckpointTrigger = ({
  children,
  className,
  variant = "ghost",
  size = "sm",
  tooltip,
  ...props
}: CheckpointTriggerProps) =>
  tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className={className}
          size={size}
          type="button"
          variant={variant}
          {...props}
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
      {...props}
    >
      {children}
    </Button>
  );
