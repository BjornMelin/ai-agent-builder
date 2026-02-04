"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Renders the Dialog component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const { ...rest } = props;

  return <DialogPrimitive.Root data-slot="dialog" {...rest} />;
}

/**
 * Renders the DialogTrigger component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DialogTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Trigger>,
) {
  const { ...rest } = props;

  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...rest} />;
}

/**
 * Renders the DialogPortal component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DialogPortal(
  props: React.ComponentProps<typeof DialogPrimitive.Portal>,
) {
  const { ...rest } = props;

  return <DialogPrimitive.Portal data-slot="dialog-portal" {...rest} />;
}

/**
 * Renders the DialogClose component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DialogClose(
  props: React.ComponentProps<typeof DialogPrimitive.Close>,
) {
  const { ...rest } = props;

  return <DialogPrimitive.Close data-slot="dialog-close" {...rest} />;
}

/**
 * Renders the DialogOverlay component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DialogOverlay(
  props: React.ComponentProps<typeof DialogPrimitive.Overlay>,
) {
  const { className, ...rest } = props;

  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 motion-reduce:animate-none motion-reduce:transition-none",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the DialogContent component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DialogContent(
  props: React.ComponentProps<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean;
  },
) {
  const { className, children, showCloseButton = true, ...rest } = props;

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg outline-none duration-200 sm:max-w-lg motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95 motion-reduce:animate-none motion-reduce:transition-none",
          className,
        )}
        {...rest}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/**
 * Renders the DialogHeader component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DialogHeader(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...rest}
    />
  );
}

/**
 * Renders the DialogFooter component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DialogFooter(
  props: React.ComponentProps<"div"> & {
    showCloseButton?: boolean;
  },
) {
  const { className, showCloseButton = false, children, ...rest } = props;

  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...rest}
    >
      {showCloseButton ? (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      ) : null}
      {children}
    </div>
  );
}

/**
 * Renders the DialogTitle component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DialogTitle(
  props: React.ComponentProps<typeof DialogPrimitive.Title>,
) {
  const { className, ...rest } = props;

  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...rest}
    />
  );
}

/**
 * Renders the DialogDescription component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DialogDescription(
  props: React.ComponentProps<typeof DialogPrimitive.Description>,
) {
  const { className, ...rest } = props;

  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...rest}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
