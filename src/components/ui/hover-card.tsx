"use client";

import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Provides a hover-triggered surface for contextual content.
 *
 * @param props - Props forwarded to Radix HoverCard.Root including open state handlers.
 * @returns The hover card root used to coordinate trigger and content.
 */
function HoverCard(
  props: React.ComponentProps<typeof HoverCardPrimitive.Root>,
) {
  const { ...rest } = props;

  return <HoverCardPrimitive.Root data-slot="hover-card" {...rest} />;
}

/**
 * Renders the interactive element that opens the hover card.
 *
 * @param props - Trigger props forwarded to Radix HoverCard.Trigger.
 * @returns The trigger element bound to the hover card root.
 */
function HoverCardTrigger(
  props: React.ComponentProps<typeof HoverCardPrimitive.Trigger>,
) {
  const { ...rest } = props;

  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...rest} />
  );
}

/**
 * Renders positioned hover content in a portal with motion-safe animation classes.
 *
 * @param props - Content props including alignment, side offset, and class name overrides.
 * @returns The portal content element displayed when the hover card opens.
 */
function HoverCardContent(
  props: React.ComponentProps<typeof HoverCardPrimitive.Content>,
) {
  const { className, align = "center", sideOffset = 4, ...rest } = props;

  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[side=bottom]:slide-in-from-top-2 motion-safe:data-[side=left]:slide-in-from-right-2 motion-safe:data-[side=right]:slide-in-from-left-2 motion-safe:data-[side=top]:slide-in-from-bottom-2 motion-reduce:animate-none motion-reduce:transition-none",
          className,
        )}
        {...rest}
      />
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
