"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Groups input controls, text, and actions into a single styled field container.
 *
 * @param props - Fieldset props applied to the group wrapper, including state and accessibility attributes.
 * @returns A fieldset that coordinates focus and invalid styling across child controls.
 */
function InputGroup(props: React.ComponentProps<"fieldset">) {
  const { className, ...rest } = props;

  return (
    <fieldset
      data-slot="input-group"
      className={cn(
        "m-0 min-w-0 border-0 p-0",
        "group/input-group border-input dark:bg-input/30 relative flex w-full items-center rounded-md border shadow-xs outline-none",
        "h-9 min-w-0 has-[>textarea]:h-auto",

        // Variants based on alignment.
        "has-[>[data-align=inline-start]]:[&>input]:pl-2",
        "has-[>[data-align=inline-end]]:[&>input]:pr-2",
        "has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3",
        "has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3",

        // Focus state.
        "has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot=input-group-control]:focus-visible]:ring-[3px]",

        // Error state.
        "has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[[data-slot][aria-invalid=true]]:border-destructive dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40",

        className,
      )}
      {...rest}
    />
  );
}

const inputGroupAddonVariants = cva(
  "text-muted-foreground flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium select-none [&>svg:not([class*='size-'])]:size-4 [&>kbd]:rounded-[calc(var(--radius)-5px)] group-data-[disabled=true]/input-group:opacity-50",
  {
    defaultVariants: {
      align: "inline-start",
    },
    variants: {
      align: {
        "block-end":
          "order-last w-full justify-start px-3 pb-3 [.border-t]:pt-3 group-has-[>input]/input-group:pb-2.5",
        "block-start":
          "order-first w-full justify-start px-3 pt-3 [.border-b]:pb-3 group-has-[>input]/input-group:pt-2.5",
        "inline-end":
          "order-last pr-3 has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]",
        "inline-start":
          "order-first pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]",
      },
    },
  },
);

/**
 * Renders decorative or helper content adjacent to input controls.
 *
 * @param props - Div props plus alignment variants controlling addon placement.
 * @returns An addon container aligned to the selected edge of the input group.
 */
function InputGroupAddon(
  props: React.ComponentProps<"div"> &
    VariantProps<typeof inputGroupAddonVariants>,
) {
  const { className, align = "inline-start", ...rest } = props;

  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      {...rest}
    />
  );
}

const inputGroupButtonVariants = cva(
  "text-sm shadow-none flex gap-2 items-center",
  {
    defaultVariants: {
      size: "xs",
    },
    variants: {
      size: {
        "icon-sm": "size-8 p-0 has-[>svg]:p-0",
        "icon-xs":
          "size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0",
        sm: "h-8 px-2.5 gap-1.5 rounded-md has-[>svg]:px-2.5",
        xs: "h-6 gap-1 px-2 rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-3.5 has-[>svg]:px-2",
      },
    },
  },
);

/**
 * Renders a button variant tuned for placement inside an input group.
 *
 * @param props - Button props with optional compact size variant overrides.
 * @returns A styled button intended for inline use within input groups.
 */
function InputGroupButton(
  props: Omit<React.ComponentProps<typeof Button>, "size"> &
    VariantProps<typeof inputGroupButtonVariants>,
) {
  const {
    className,
    type = "button",
    variant = "ghost",
    size = "xs",
    ...rest
  } = props;

  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...rest}
    />
  );
}

/**
 * Renders inline text content within an input group addon area.
 *
 * @param props - Span props used for labels, hints, or keyboard shortcut text.
 * @returns A text span with icon-friendly inline layout styles.
 */
function InputGroupText(props: React.ComponentProps<"span">) {
  const { className, ...rest } = props;

  return (
    <span
      className={cn(
        "text-muted-foreground flex items-center gap-2 text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders an input control styled for seamless embedding in an input group.
 *
 * @param props - Input props forwarded to the underlying Input primitive.
 * @returns An input element with borderless group-integrated styling.
 */
function InputGroupInput(props: React.ComponentProps<"input">) {
  const { className, ...rest } = props;

  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders a textarea control styled for multi-line input groups.
 *
 * @param props - Textarea props forwarded to the underlying Textarea primitive.
 * @returns A textarea element with group-integrated spacing and focus styles.
 */
function InputGroupTextarea(props: React.ComponentProps<"textarea">) {
  const { className, ...rest } = props;

  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        "flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0 dark:bg-transparent",
        className,
      )}
      {...rest}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
};
