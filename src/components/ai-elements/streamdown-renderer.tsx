"use client";

import dynamic from "next/dynamic";
import type { StreamdownRendererProps as InnerStreamdownRendererProps } from "./streamdown-renderer-inner";

/**
 * Client-only Streamdown renderer with lazy loading.
 *
 * @remarks
 * This component is dynamically imported with SSR disabled because Streamdown
 * plugins depend on browser-only behavior.
 */
const StreamdownRenderer = dynamic<InnerStreamdownRendererProps>(
  () => import("./streamdown-renderer-inner"),
  {
    loading: () => (
      <div className="text-muted-foreground text-sm">Loading…</div>
    ),
    ssr: false,
  },
);

export { StreamdownRenderer };
/** Props for the client-only `StreamdownRenderer` component. */
export type StreamdownRendererProps = InnerStreamdownRendererProps;
