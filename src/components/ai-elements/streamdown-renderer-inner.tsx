"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";

/** Props for the StreamdownRenderer component. */
export type StreamdownRendererProps = ComponentProps<typeof Streamdown>;

/**
 * Renders Streamdown with common markdown plugins.
 *
 * @param props - Streamdown props including content and options.
 * @returns A Streamdown renderer element.
 */
export default function StreamdownRenderer(props: StreamdownRendererProps) {
  return <Streamdown plugins={{ cjk, code, math, mermaid }} {...props} />;
}
