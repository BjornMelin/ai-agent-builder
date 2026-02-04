"use client";

import type { ToolUIPart } from "ai";
import { ChevronDownIcon, Code } from "lucide-react";
import type { ComponentProps } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getStatusBadge } from "./tool";

/** Props for the Sandbox root component. */
export type SandboxRootProps = ComponentProps<typeof Collapsible>;

/**
 * Provides the root collapsible container for sandbox tool output.
 *
 * @param props - Props forwarded to `Collapsible`.
 * @returns A styled sandbox container.
 */
export const Sandbox = (props: SandboxRootProps) => {
  const { className, ...rest } = props;
  return (
    <Collapsible
      className={cn(
        "not-prose group mb-4 w-full overflow-hidden rounded-md border",
        className,
      )}
      defaultOpen
      {...rest}
    />
  );
};

/** Props for the SandboxHeader component. */
export type SandboxHeaderProps = Omit<
  ComponentProps<typeof CollapsibleTrigger>,
  "children"
> & {
  title?: string;
  state: ToolUIPart["state"];
};

/**
 * Renders the sandbox header with title and tool execution state.
 *
 * @param props - Header fields and trigger props.
 * @returns A collapsible trigger for the sandbox section.
 */
export const SandboxHeader = (props: SandboxHeaderProps) => {
  const { className, title, state, ...rest } = props;
  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-4 p-3",
        className,
      )}
      {...rest}
    >
      <div className="flex items-center gap-2">
        <Code className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{title}</span>
        {getStatusBadge(state)}
      </div>
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

/** Props for the SandboxContent component. */
export type SandboxContentProps = ComponentProps<typeof CollapsibleContent>;

/**
 * Renders the collapsible body container for sandbox content.
 *
 * @param props - Props forwarded to `CollapsibleContent`.
 * @returns A sandbox content wrapper.
 */
export const SandboxContent = (props: SandboxContentProps) => {
  const { className, ...rest } = props;
  return (
    <CollapsibleContent
      className={cn(
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=open]:animate-in focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the SandboxTabs component. */
export type SandboxTabsProps = ComponentProps<typeof Tabs>;

/**
 * Renders the tabs root used inside sandbox content.
 *
 * @param props - Props forwarded to `Tabs`.
 * @returns A styled tabs container.
 */
export const SandboxTabs = (props: SandboxTabsProps) => {
  const { className, ...rest } = props;
  return <Tabs className={cn("w-full gap-0", className)} {...rest} />;
};

/** Props for the SandboxTabsBar component. */
export type SandboxTabsBarProps = ComponentProps<"div">;

/**
 * Renders the horizontal bar that contains sandbox tab controls.
 *
 * @param props - Props for the bar container.
 * @returns A sandbox tabs bar element.
 */
export const SandboxTabsBar = (props: SandboxTabsBarProps) => {
  const { className, ...rest } = props;
  return (
    <div
      className={cn(
        "flex w-full items-center border-border border-t border-b",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the SandboxTabsList component. */
export type SandboxTabsListProps = ComponentProps<typeof TabsList>;

/**
 * Renders the list container for sandbox tab triggers.
 *
 * @param props - Props forwarded to `TabsList`.
 * @returns A styled tabs list.
 */
export const SandboxTabsList = (props: SandboxTabsListProps) => {
  const { className, ...rest } = props;
  return (
    <TabsList
      className={cn(
        "h-auto rounded-none border-0 bg-transparent p-0",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the SandboxTabsTrigger component. */
export type SandboxTabsTriggerProps = ComponentProps<typeof TabsTrigger>;

/**
 * Renders one selectable tab trigger for sandbox views.
 *
 * @param props - Props forwarded to `TabsTrigger`.
 * @returns A styled tabs trigger.
 */
export const SandboxTabsTrigger = (props: SandboxTabsTriggerProps) => {
  const { className, ...rest } = props;
  return (
    <TabsTrigger
      className={cn(
        "rounded-none border-0 border-transparent border-b-2 px-4 py-2 font-medium text-muted-foreground text-sm transition-colors data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the SandboxTabContent component. */
export type SandboxTabContentProps = ComponentProps<typeof TabsContent>;

/**
 * Renders the panel content for a sandbox tab.
 *
 * @param props - Props forwarded to `TabsContent`.
 * @returns A tab content panel.
 */
export const SandboxTabContent = (props: SandboxTabContentProps) => {
  const { className, ...rest } = props;
  return <TabsContent className={cn("mt-0 text-sm", className)} {...rest} />;
};
