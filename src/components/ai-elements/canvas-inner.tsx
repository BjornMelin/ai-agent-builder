"use client";

import { Background, ReactFlow, type ReactFlowProps } from "@xyflow/react";
import type { ReactNode } from "react";
import "@xyflow/react/dist/style.css";

/** Props for the Canvas component. */
export type CanvasProps = ReactFlowProps & {
  children?: ReactNode;
};

/**
 * Renders a configured React Flow canvas with default behaviors.
 *
 * @param props - React Flow props and optional children.
 * @returns A canvas element with background and flow controls.
 */
export const CanvasInner = (props: CanvasProps) => {
  const { children, ...rest } = props;
  return (
    <ReactFlow
      deleteKeyCode={["Backspace", "Delete"]}
      fitView
      panOnDrag={false}
      panOnScroll
      selectionOnDrag={true}
      zoomOnDoubleClick={false}
      {...rest}
    >
      <Background bgColor="var(--sidebar)" />
      {children}
    </ReactFlow>
  );
};
