"use client";

import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import type { ComponentProps } from "react";

/**
 * Renders the Collapsible component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function Collapsible(props: ComponentProps<typeof CollapsiblePrimitive.Root>) {
  const { ...rest } = props;

  return <CollapsiblePrimitive.Root data-slot="collapsible" {...rest} />;
}

/**
 * Renders the CollapsibleTrigger component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CollapsibleTrigger(
  props: ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>,
) {
  const { ...rest } = props;

  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...rest}
    />
  );
}

/**
 * Renders the CollapsibleContent component.
 *
 * @param props - Component props.
 * @returns A JSX element.
 */
function CollapsibleContent(
  props: ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>,
) {
  const { ...rest } = props;

  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...rest}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
