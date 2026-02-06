"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders the TooltipProvider component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function TooltipProvider(
  props: React.ComponentProps<typeof TooltipPrimitive.Provider>,
) {
  const { delayDuration = 0, ...rest } = props;

  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...rest}
    />
  );
}

/**
 * Renders the Tooltip component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const { ...rest } = props;

  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...rest} />
    </TooltipProvider>
  );
}

/**
 * Renders the TooltipTrigger component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function TooltipTrigger(
  props: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
) {
  const { ...rest } = props;

  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...rest} />;
}

/**
 * Renders the TooltipContent component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function TooltipContent(
  props: React.ComponentProps<typeof TooltipPrimitive.Content>,
) {
  const { className, sideOffset = 6, children, ...rest } = props;

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-foreground text-background motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[side=bottom]:slide-in-from-top-2 motion-safe:data-[side=left]:slide-in-from-right-2 motion-safe:data-[side=right]:slide-in-from-left-2 motion-safe:data-[side=top]:slide-in-from-bottom-2 motion-reduce:animate-none motion-reduce:transition-none z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
          className,
        )}
        {...rest}
      >
        {children}
        <TooltipPrimitive.Arrow className="bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
