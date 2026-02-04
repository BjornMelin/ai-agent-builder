"use client";

import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders a scroll container with a styled viewport and custom scrollbar.
 *
 * @param props - Root props forwarded to Radix ScrollArea, including children and class names.
 * @returns A scroll area root with viewport, scrollbar, and corner primitives.
 */
function ScrollArea(
  props: React.ComponentProps<typeof ScrollAreaPrimitive.Root>,
) {
  const { className, children, ...rest } = props;

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...rest}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="focus-visible:ring-ring/50 size-full rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

/**
 * Renders the scrollbar track and thumb for a given orientation.
 *
 * @param props - Scrollbar props including orientation and class overrides.
 * @returns A Radix scrollbar element with an orientation-aware layout.
 */
function ScrollBar(
  props: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
) {
  const { className, orientation = "vertical", ...rest } = props;

  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none select-none p-px",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent",
        className,
      )}
      {...rest}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="bg-border relative flex-1 rounded-full"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
