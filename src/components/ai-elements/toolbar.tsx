"use client";

import dynamic from "next/dynamic";

/** Props for the lazily loaded `Toolbar` component. */
export type ToolbarProps = import("./toolbar-inner").ToolbarProps;

/**
 * Lazily load the XYFlow toolbar to keep `xyflow/react` out of the main bundle.
 */
export const Toolbar = dynamic<ToolbarProps>(
  () => import("./toolbar-inner").then((mod) => mod.ToolbarInner),
  {
    loading: () => <div aria-hidden="true" className="h-full w-full" />,
    ssr: false,
  },
);
