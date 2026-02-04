import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders the Card component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function Card(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the CardHeader component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CardHeader(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the CardTitle component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CardTitle(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...rest}
    />
  );
}

/**
 * Renders the CardDescription component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CardDescription(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...rest}
    />
  );
}

/**
 * Renders the CardAction component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CardAction(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the CardContent component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CardContent(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  return (
    <div data-slot="card-content" className={cn("px-6", className)} {...rest} />
  );
}

/**
 * Renders the CardFooter component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CardFooter(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...rest}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
