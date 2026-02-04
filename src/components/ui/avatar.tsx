"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders the primary avatar container with size-aware styling.
 *
 * @param props - Root primitive props including an optional `size`
 *   ("default" | "sm" | "lg") and `className`.
 *   Props are forwarded to `AvatarPrimitive.Root`.
 * @returns Returns an `AvatarPrimitive.Root` JSX element representing the avatar shell with `data-slot="avatar"` and corresponding data-size attributes.
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
 * Renders the avatar image source.
 *
 * @param props - Image primitive props including `src`, `alt`, and `className`.
 *   Props are forwarded to `AvatarPrimitive.Image`.
 * @returns Returns an `AvatarPrimitive.Image` JSX element for
 *   rendering the avatar source with `data-slot="avatar-image"`.
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
 * Renders a fallback container for the avatar when no image is available.
 *
 * @param props - Fallback primitive props including `className` and children.
 *   Props are forwarded to `AvatarPrimitive.Fallback`.
 * @returns Returns an `AvatarPrimitive.Fallback` JSX element with
 *   `data-slot="avatar-fallback"` and theme-aware styling.
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
 * Renders a decorative status badge or dot overlaid on the avatar.
 *
 * @param props - Standard span props including `className` and children.
 *   Props are forwarded to the underlying span element.
 * @returns Returns a `span` JSX element representing a status badge with
 *   `data-slot="avatar-badge"`.
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
 * Renders a horizontal stack of avatars.
 *
 * @param props - Standard div props including `className` and children.
 *   Props are forwarded to the underlying div element.
 * @returns Returns a `div` JSX element representing a group container with
 *   `data-slot="avatar-group"`.
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
 * Renders a visual count indicator for remaining items in an avatar group.
 *
 * @param props - Standard div props including `className` and children.
 *   Props are forwarded to the underlying div element.
 * @returns Returns a `div` JSX element representing a group overflow count with
 *   `data-slot="avatar-group-count"`.
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
