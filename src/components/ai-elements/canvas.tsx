"use client";

import dynamic from "next/dynamic";
import type { CanvasProps } from "./canvas-inner";

/**
 * Lazily load the React Flow canvas to keep `xyflow/react` out of the main bundle.
 */
export const Canvas = dynamic<CanvasProps>(
  () => import("./canvas-inner").then((mod) => mod.CanvasInner),
  {
    loading: () => <div aria-hidden="true" className="h-full w-full" />,
    ssr: false,
  },
);
