"use client";

import dynamic from "next/dynamic";

/** Props for the lazily loaded `Panel` component. */
export type PanelProps = import("./panel-inner").PanelProps;

/**
 * Lazily load the XYFlow panel to keep `xyflow/react` out of the main bundle.
 */
export const Panel = dynamic<PanelProps>(
  () => import("./panel-inner").then((mod) => mod.PanelInner),
  {
    loading: () => <div aria-hidden="true" className="h-full w-full" />,
    ssr: false,
  },
);
