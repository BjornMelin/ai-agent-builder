"use client";

import { Panel as PanelPrimitive } from "@xyflow/react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Props for the Panel component. */
export type PanelProps = ComponentProps<typeof PanelPrimitive>;

/**
 * Renders a positioned panel inside a React Flow canvas.
 *
 * @param props - Panel props including positioning and children.
 * @returns A panel element.
 */
export const PanelInner = (props: PanelProps) => {
  const { className, ...rest } = props;
  return (
    <PanelPrimitive
      className={cn(
        "m-4 overflow-hidden rounded-md border bg-card p-1",
        className,
      )}
      {...rest}
    />
  );
};
