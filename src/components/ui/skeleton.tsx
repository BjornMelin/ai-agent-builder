import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Generic loading placeholder block.
 *
 * @param props - Div props used to size and position the skeleton.
 * @returns Animated skeleton element.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  );
}
