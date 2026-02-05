"use client";

import dynamic from "next/dynamic";

type EdgeProps = import("@xyflow/react").EdgeProps;

const Animated = dynamic<EdgeProps>(
  () => import("./edge-inner").then((mod) => mod.Animated),
  {
    loading: () => null,
    ssr: false,
  },
);

const Temporary = dynamic<EdgeProps>(
  () => import("./edge-inner").then((mod) => mod.Temporary),
  {
    loading: () => null,
    ssr: false,
  },
);

/**
 * Edge renderers for animated and temporary connections.
 *
 * @remarks
 * Use `Edge.Animated` for animated edges and `Edge.Temporary` for dashed edges.
 */
export const Edge = {
  Animated,
  Temporary,
};
