"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders the DropdownMenu component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenu(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>,
) {
  const { ...rest } = props;

  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...rest} />;
}

/**
 * Renders the DropdownMenuPortal component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuPortal(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>,
) {
  const { ...rest } = props;

  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...rest} />
  );
}

/**
 * Renders the DropdownMenuTrigger component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuTrigger(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
) {
  const { ...rest } = props;

  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...rest}
    />
  );
}

/**
 * Renders the DropdownMenuContent component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuContent(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Content>,
) {
  const { className, sideOffset = 4, ...rest } = props;

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[side=bottom]:slide-in-from-top-2 motion-safe:data-[side=left]:slide-in-from-right-2 motion-safe:data-[side=right]:slide-in-from-left-2 motion-safe:data-[side=top]:slide-in-from-bottom-2 motion-reduce:animate-none motion-reduce:transition-none",
          className,
        )}
        {...rest}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

/**
 * Renders the DropdownMenuGroup component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuGroup(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>,
) {
  const { ...rest } = props;

  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...rest} />
  );
}

/**
 * Renders the DropdownMenuItem component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuItem(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    variant?: "default" | "destructive";
  },
) {
  const { className, inset, variant = "default", ...rest } = props;

  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the DropdownMenuCheckboxItem component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuCheckboxItem(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>,
) {
  const { className, children, checked, ...rest } = props;

  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...(checked === undefined ? {} : { checked })}
      {...rest}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

/**
 * Renders the DropdownMenuRadioGroup component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuRadioGroup(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>,
) {
  const { ...rest } = props;

  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...rest}
    />
  );
}

/**
 * Renders the DropdownMenuRadioItem component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuRadioItem(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>,
) {
  const { className, children, ...rest } = props;

  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...rest}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

/**
 * Renders the DropdownMenuLabel component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuLabel(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  },
) {
  const { className, inset, ...rest } = props;

  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the DropdownMenuSeparator component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuSeparator(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>,
) {
  const { className, ...rest } = props;

  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...rest}
    />
  );
}

/**
 * Renders the DropdownMenuShortcut component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuShortcut(props: React.ComponentProps<"span">) {
  const { className, ...rest } = props;

  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the DropdownMenuSub component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuSub(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>,
) {
  const { ...rest } = props;

  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...rest} />;
}

/**
 * Renders the DropdownMenuSubTrigger component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuSubTrigger(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  },
) {
  const { className, inset, children, ...rest } = props;

  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...rest}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

/**
 * Renders the DropdownMenuSubContent component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function DropdownMenuSubContent(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>,
) {
  const { className, ...rest } = props;

  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "bg-popover text-popover-foreground z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[side=bottom]:slide-in-from-top-2 motion-safe:data-[side=left]:slide-in-from-right-2 motion-safe:data-[side=right]:slide-in-from-left-2 motion-safe:data-[side=top]:slide-in-from-bottom-2 motion-reduce:animate-none motion-reduce:transition-none",
        className,
      )}
      {...rest}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
