"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders the Avatar component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
export function Avatar(
  props: React.ComponentProps<typeof AvatarPrimitive.Root> & {
    size?: "default" | "sm" | "lg";
  },
) {
  const { className, size = "default", ...rest } = props;

  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none data-[size=lg]:size-10 data-[size=sm]:size-6",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the AvatarImage component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
export function AvatarImage(
  props: React.ComponentProps<typeof AvatarPrimitive.Image>,
) {
  const { className, ...rest } = props;

  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...rest}
    />
  );
}

/**
 * Renders the AvatarFallback component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
export function AvatarFallback(
  props: React.ComponentProps<typeof AvatarPrimitive.Fallback>,
) {
  const { className, ...rest } = props;

  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-sm group-data-[size=sm]/avatar:text-xs",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the AvatarBadge component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
export function AvatarBadge(props: React.ComponentProps<"span">) {
  const { className, ...rest } = props;

  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "bg-primary text-primary-foreground ring-background absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full ring-2 select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the AvatarGroup component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
export function AvatarGroup(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "*:data-[slot=avatar]:ring-background group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the AvatarGroupCount component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
export function AvatarGroupCount(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "bg-muted text-muted-foreground ring-background relative flex size-8 shrink-0 items-center justify-center rounded-full text-sm ring-2 group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className,
      )}
      {...rest}
    />
  );
}
