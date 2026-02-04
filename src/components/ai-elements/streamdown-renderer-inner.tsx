"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";

export type StreamdownRendererProps = ComponentProps<typeof Streamdown>;

export default function StreamdownRenderer(props: StreamdownRendererProps) {
  return <Streamdown plugins={{ cjk, code, math, mermaid }} {...props} />;
}
