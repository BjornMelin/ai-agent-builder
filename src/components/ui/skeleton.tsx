import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Generic loading placeholder block.
 *
 * @param props - Div props used to size and position the skeleton.
 * @returns Animated skeleton element.
 */
export function Skeleton(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "bg-accent rounded-md motion-safe:animate-pulse motion-reduce:animate-none",
        className,
      )}
      {...rest}
    />
  );
}
