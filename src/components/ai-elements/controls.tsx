"use client";

import { Controls as ControlsPrimitive } from "@xyflow/react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Props for the Controls component. */
export type ControlsProps = ComponentProps<typeof ControlsPrimitive>;

/**
 * Renders styled XYFlow controls.
 *
 * @param props - Controls props for the XYFlow controls.
 * @returns A controls element.
 */
export const Controls = (props: ControlsProps) => {
  const { className, ...rest } = props;
  return (
    <ControlsPrimitive
      className={cn(
        "gap-px overflow-hidden rounded-md border bg-card p-1 shadow-none!",
        "[&>button]:rounded-md [&>button]:border-none! [&>button]:bg-transparent! [&>button]:hover:bg-secondary!",
        className,
      )}
      {...rest}
    />
  );
};
