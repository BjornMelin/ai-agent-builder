"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";

const STREAMDOWN_PLUGINS = { cjk, code, math, mermaid } as const;

/** Props for the StreamdownRenderer component. */
export type StreamdownRendererProps = ComponentProps<typeof Streamdown>;

/**
 * Renders Streamdown with common markdown plugins.
 *
 * @param props - Streamdown props including content and options.
 * @returns A Streamdown renderer element.
 */
const StreamdownRenderer = (props: StreamdownRendererProps) => {
  return <Streamdown plugins={STREAMDOWN_PLUGINS} {...props} />;
};

export default memo(StreamdownRenderer);
