"use client";

import { Handle, Position } from "@xyflow/react";
import type { ComponentProps } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Props for the Node component. */
export type NodeProps = ComponentProps<typeof Card> & {
  handles: {
    target: boolean;
    source: boolean;
  };
};

/**
 * Renders an XYFlow node with optional source and target handles.
 *
 * @param props - Card props including handle configuration.
 * @returns A node card element with connection handles.
 */
export const NodeInner = (props: NodeProps) => {
  const { handles, className, children, ...rest } = props;
  return (
    <Card
      className={cn(
        "node-container relative size-full h-auto w-sm gap-0 rounded-md p-0",
        className,
      )}
      {...rest}
    >
      {handles.target ? (
        <Handle position={Position.Left} type="target" />
      ) : null}
      {handles.source ? (
        <Handle position={Position.Right} type="source" />
      ) : null}
      {children}
    </Card>
  );
};
