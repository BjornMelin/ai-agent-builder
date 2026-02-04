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
 * Renders the root cmdk command container.
 *
 * @param props - `React.ComponentProps<typeof CommandPrimitive>` passed to cmdk's root, including optional `className`; remaining props are forwarded via `{...rest}`.
 * @returns Returns a JSX.Element rendering the Command root with passed props and `data-slot="command"`/merged `className` for styling.
 */
export function Command(props: React.ComponentProps<typeof CommandPrimitive>) {
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
 * Renders a command palette inside the shared dialog shell.
 *
 * @param props - Dialog props plus optional `title?: string`, `description?: string`, `className?: string`, and `showCloseButton?: boolean`; defaults are `"Command Palette"`, `"Search for a command to run..."`, and `true`, and remaining props are forwarded via `{...rest}`.
 * @returns Returns a JSX.Element rendering the Command dialog with passed props, dialog metadata defaults, and styled content wrappers.
 */
export function CommandDialog(
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
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 [&_[data-slot=command-input-wrapper]]:h-12">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Renders the cmdk input row with search icon and text input.
 *
 * @param props - `React.ComponentProps<typeof CommandPrimitive.Input>` for the cmdk input; controls input attributes/events, optional `className`, defaults `aria-label` to `"Search"` when omitted, and forwards remaining props via `{...rest}`.
 * @returns Returns a JSX.Element rendering the Command input wrapper and input with `data-slot` attributes and merged `className` for styling.
 */
export function CommandInput(
  props: React.ComponentProps<typeof CommandPrimitive.Input>,
) {
  const { className, "aria-label": ariaLabel, ...rest } = props;
  const accessibleLabel = ariaLabel ?? "Search";

  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b px-3"
    >
      <SearchIcon aria-hidden="true" className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...rest}
        aria-label={accessibleLabel}
      />
    </div>
  );
}

/**
 * Renders the scrollable list container for command results.
 *
 * @param props - `React.ComponentProps<typeof CommandPrimitive.List>` for the cmdk list, including optional `className`; remaining props are forwarded via `{...rest}`.
 * @returns Returns a JSX.Element rendering the Command list with passed props and `data-slot="command-list"`/merged `className` for styling.
 */
export function CommandList(
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
 * Renders the empty-state content shown when no command results match.
 *
 * @param props - `React.ComponentProps<typeof CommandPrimitive.Empty>` for cmdk empty state content; props are forwarded via `{...rest}`.
 * @returns Returns a JSX.Element rendering the Command empty state with passed props and `data-slot="command-empty"` styling hooks.
 */
export function CommandEmpty(
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
 * Renders a grouped command section and heading styles.
 *
 * @param props - `React.ComponentProps<typeof CommandPrimitive.Group>` controlling group content/attributes with optional `className`; remaining props are forwarded via `{...rest}`.
 * @returns Returns a JSX.Element rendering the Command group with passed props and `data-slot="command-group"`/merged `className` for styling.
 */
export function CommandGroup(
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
 * Renders a visual separator between command sections.
 *
 * @param props - `React.ComponentProps<typeof CommandPrimitive.Separator>` controlling separator attributes with optional `className`; remaining props are forwarded via `{...rest}`.
 * @returns Returns a JSX.Element rendering the Command separator with passed props and `data-slot="command-separator"`/merged `className` for styling.
 */
export function CommandSeparator(
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
 * Renders an individual selectable command item.
 *
 * @param props - `React.ComponentProps<typeof CommandPrimitive.Item>` controlling item behavior/attributes with optional `className`; remaining props are forwarded via `{...rest}`.
 * @returns Returns a JSX.Element rendering the Command item with passed props and `data-slot="command-item"`/merged `className` for styling.
 */
export function CommandItem(
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
 * Renders trailing shortcut text for a command item.
 *
 * @param props - `React.ComponentProps<"span">` for the shortcut label element, including optional `className` and standard span attributes/events; remaining props are forwarded via `{...rest}`.
 * @returns Returns a JSX.Element rendering the Command shortcut with passed props and `data-slot="command-shortcut"`/merged `className` for styling.
 */
export function CommandShortcut(props: React.ComponentProps<"span">) {
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
