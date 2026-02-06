"use client";

import dynamic from "next/dynamic";

/** Props for the Controls component. */
export type ControlsProps = import("./controls-inner").ControlsProps;

/**
 * Lazily load the XYFlow controls to keep `xyflow/react` out of the main bundle.
 */
export const Controls = dynamic<ControlsProps>(
  () => import("./controls-inner").then((mod) => mod.ControlsInner),
  {
    loading: () => <div aria-hidden="true" className="h-full w-full" />,
    ssr: false,
  },
);
