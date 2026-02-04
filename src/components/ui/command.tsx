"use client";

import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import type * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Renders the Command component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function Command(props: React.ComponentProps<typeof CommandPrimitive>) {
  const { className, ...rest } = props;

  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the CommandDialog component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CommandDialog(
  props: React.ComponentProps<typeof Dialog> & {
    title?: string;
    description?: string;
    className?: string;
    showCloseButton?: boolean;
  },
) {
  const {
    title = "Command Palette",
    description = "Search for a command to run...",
    children,
    className,
    showCloseButton = true,
    ...rest
  } = props;

  return (
    <Dialog {...rest}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Renders the CommandInput component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CommandInput(
  props: React.ComponentProps<typeof CommandPrimitive.Input>,
) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b px-3"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...rest}
      />
    </div>
  );
}

/**
 * Renders the CommandList component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CommandList(
  props: React.ComponentProps<typeof CommandPrimitive.List>,
) {
  const { className, ...rest } = props;

  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the CommandEmpty component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CommandEmpty(
  props: React.ComponentProps<typeof CommandPrimitive.Empty>,
) {
  const { ...rest } = props;

  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...rest}
    />
  );
}

/**
 * Renders the CommandGroup component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CommandGroup(
  props: React.ComponentProps<typeof CommandPrimitive.Group>,
) {
  const { className, ...rest } = props;

  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the CommandSeparator component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CommandSeparator(
  props: React.ComponentProps<typeof CommandPrimitive.Separator>,
) {
  const { className, ...rest } = props;

  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...rest}
    />
  );
}

/**
 * Renders the CommandItem component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CommandItem(
  props: React.ComponentProps<typeof CommandPrimitive.Item>,
) {
  const { className, ...rest } = props;

  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the CommandShortcut component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CommandShortcut(props: React.ComponentProps<"span">) {
  const { className, ...rest } = props;

  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className,
      )}
      {...rest}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
