"use client";

import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A progress bar component that displays the completion status of a task.
 *
 * @param props - The progress component properties.
 * @returns - The rendered progress component.
 */
export function Progress(
  props: React.ComponentProps<typeof ProgressPrimitive.Root>,
) {
  const { className, value, ...rest } = props;
  const numericValue =
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const clampedValue =
    numericValue === undefined ? 0 : Math.max(0, Math.min(100, numericValue));

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      value={numericValue === undefined ? undefined : clampedValue}
      {...rest}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-transform"
        style={{ transform: `translateX(-${100 - clampedValue}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
