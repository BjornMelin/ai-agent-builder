"use client";

import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import type { ComponentProps } from "react";

/**
 * Provides the root disclosure state container for collapsible content.
 *
 * @param props - Props forwarded to Radix Collapsible.Root.
 * @returns A collapsible root element with shared open/closed state.
 */
function Collapsible(props: ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

/**
 * Renders the interactive trigger that toggles collapsible state.
 *
 * @param props - Props forwarded to Radix Collapsible.CollapsibleTrigger.
 * @returns A trigger element connected to the nearest collapsible root.
 */
function CollapsibleTrigger(
  props: ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>,
) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  );
}

/**
 * Renders the content region controlled by the collapsible trigger.
 *
 * @param props - Props forwarded to Radix Collapsible.CollapsibleContent.
 * @returns A content element shown or hidden based on collapsible state.
 */
function CollapsibleContent(
  props: ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>,
) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
