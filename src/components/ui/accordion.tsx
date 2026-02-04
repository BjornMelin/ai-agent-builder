"use client";

import { ChevronDownIcon } from "lucide-react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Root container for collapsible accordion sections.
 *
 * @param props - Radix accordion root props controlling selection mode and active items.
 * @returns The accordion root that manages item expansion state.
 */
function Accordion(
  props: React.ComponentProps<typeof AccordionPrimitive.Root>,
) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

/**
 * One collapsible item within the accordion.
 *
 * @param props - Radix accordion item props including `value`.
 * @returns The styled accordion item wrapper.
 */
function AccordionItem(
  props: React.ComponentProps<typeof AccordionPrimitive.Item>,
) {
  const { className, ...rest } = props;

  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...rest}
    />
  );
}

/**
 * Trigger button that toggles an accordion item.
 *
 * @param props - Radix accordion trigger props plus trigger content.
 * @returns The accordion trigger inside an accessible header.
 */
function AccordionTrigger(
  props: React.ComponentProps<typeof AccordionPrimitive.Trigger>,
) {
  const { className, children, ...rest } = props;

  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          className,
        )}
        {...rest}
      >
        {children}
        <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200 motion-reduce:transition-none" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

/**
 * Expandable panel content for an accordion item.
 *
 * @param props - Radix accordion content props and panel children.
 * @returns The accordion content region with open/close animations.
 */
function AccordionContent(
  props: React.ComponentProps<typeof AccordionPrimitive.Content>,
) {
  const { className, children, ...rest } = props;

  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:animate-none overflow-hidden text-sm"
      {...rest}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
