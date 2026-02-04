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
  const clampedValue = Math.max(0, Math.min(100, Number(value || 0)));

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      value={clampedValue}
      {...rest}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - clampedValue}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
