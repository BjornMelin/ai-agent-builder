import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders an empty-state container with centered content.
 *
 * @param props - Div props and optional className overrides.
 * @returns The empty-state container element.
 */
export function Empty(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center text-balance md:p-12",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Empty-state header container.
 *
 * @param props - Div props and optional className overrides.
 * @returns The empty-state header element.
 */
export function EmptyHeader(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;
  return (
    <div
      data-slot="empty-header"
      className={cn(
        "flex max-w-sm flex-col items-center gap-2 text-center",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Style variants for {@link EmptyMedia}.
 *
 * @returns A class-variance-authority variant function.
 */
export const emptyMediaVariants = cva(
  "flex shrink-0 items-center justify-center mb-2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "bg-muted text-foreground size-10 rounded-lg [&_svg:not([class*='size-'])]:size-6",
      },
    },
  },
);

/**
 * Empty-state media wrapper (icon/illustration slot).
 *
 * @param props - Div props, variant selection, and optional className overrides.
 * @returns The empty-state media wrapper element.
 */
export function EmptyMedia(
  props: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>,
) {
  const { className, variant = "default", ...rest } = props;
  return (
    <div
      data-slot="empty-media"
      data-variant={variant}
      className={cn(emptyMediaVariants({ className, variant }))}
      {...rest}
    />
  );
}

/**
 * Empty-state title heading.
 *
 * @param props - Heading props and optional className overrides.
 * @returns The empty-state title element.
 */
export function EmptyTitle(props: React.ComponentProps<"h3">) {
  const { className, ...rest } = props;
  return (
    <h3
      data-slot="empty-title"
      className={cn("text-lg font-medium tracking-tight", className)}
      {...rest}
    />
  );
}

/**
 * Empty-state description block (supports inline links).
 *
 * @param props - Div props and optional className overrides.
 * @returns The empty-state description element.
 */
export function EmptyDescription(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-muted-foreground [&>a:hover]:text-primary text-sm/relaxed [&>a]:underline [&>a]:underline-offset-4",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Empty-state content area (typically holds actions).
 *
 * @param props - Div props and optional className overrides.
 * @returns The empty-state content element.
 */
export function EmptyContent(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
        className,
      )}
      {...rest}
    />
  );
}
