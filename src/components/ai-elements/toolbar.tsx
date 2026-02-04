import { NodeToolbar, Position } from "@xyflow/react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type ToolbarProps = ComponentProps<typeof NodeToolbar>;

/**
 * Renders a node toolbar fixed to the bottom position.
 *
 * @param props - Toolbar props for NodeToolbar.
 * @returns A positioned toolbar element.
 */
export const Toolbar = (props: ToolbarProps) => {
  const { className, ...rest } = props;
  return (
    <NodeToolbar
      {...rest}
      className={cn(
        "flex items-center gap-1 rounded-sm border bg-background p-1.5",
        className,
      )}
      position={Position.Bottom}
    />
  );
};
