"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders the Popover component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const { ...rest } = props;

  return <PopoverPrimitive.Root data-slot="popover" {...rest} />;
}

/**
 * Renders the PopoverTrigger component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function PopoverTrigger(
  props: React.ComponentProps<typeof PopoverPrimitive.Trigger>,
) {
  const { ...rest } = props;

  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...rest} />;
}

/**
 * Renders the PopoverContent component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function PopoverContent(
  props: React.ComponentProps<typeof PopoverPrimitive.Content>,
) {
  const { className, align = "center", sideOffset = 4, ...rest } = props;

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className,
        )}
        {...rest}
      />
    </PopoverPrimitive.Portal>
  );
}

/**
 * Renders the PopoverAnchor component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function PopoverAnchor(
  props: React.ComponentProps<typeof PopoverPrimitive.Anchor>,
) {
  const { ...rest } = props;

  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...rest} />;
}

/**
 * Renders the PopoverHeader component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function PopoverHeader(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...rest}
    />
  );
}

/**
 * Renders the PopoverTitle component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function PopoverTitle(props: React.ComponentProps<"h2">) {
  const { className, ...rest } = props;

  return (
    <h2
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...rest}
    />
  );
}

/**
 * Renders the PopoverDescription component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function PopoverDescription(props: React.ComponentProps<"p">) {
  const { className, ...rest } = props;

  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...rest}
    />
  );
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
};
