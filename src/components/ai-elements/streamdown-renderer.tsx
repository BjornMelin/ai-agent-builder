"use client";

import dynamic from "next/dynamic";
import type { StreamdownRendererProps } from "./streamdown-renderer-inner";

/**
 * Client-only Streamdown renderer with lazy loading.
 */
const StreamdownRenderer = dynamic<StreamdownRendererProps>(
  () => import("./streamdown-renderer-inner"),
  {
    loading: () => (
      <div className="text-muted-foreground text-sm">Loading…</div>
    ),
    ssr: false,
  },
);

export { StreamdownRenderer };
/** Props for the StreamdownRenderer component. */
export type { StreamdownRendererProps };
