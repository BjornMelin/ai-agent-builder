"use client";

import { ChevronDownIcon, SearchIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/** Props for the TaskItemFile component. */
export type TaskItemFileProps = ComponentProps<"div">;

/**
 * Renders a compact badge-like label for a file referenced by a task item.
 *
 * @param props - Props forwarded to the file label container.
 * @returns A styled task file label.
 */
export const TaskItemFile = (props: TaskItemFileProps) => {
  const { children, className, ...rest } = props;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border bg-secondary px-1.5 py-0.5 text-foreground text-xs",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

/** Props for the TaskItem component. */
export type TaskItemProps = ComponentProps<"div">;

/**
 * Renders a single task item row.
 *
 * @param props - Props forwarded to the task item container.
 * @returns A styled task item element.
 */
export const TaskItem = (props: TaskItemProps) => {
  const { children, className, ...rest } = props;

  return (
    <div className={cn("text-muted-foreground text-sm", className)} {...rest}>
      {children}
    </div>
  );
};

/** Props for the Task component. */
export type TaskProps = ComponentProps<typeof Collapsible>;

/**
 * Wraps task content in a collapsible container.
 *
 * @param props - Props forwarded to `Collapsible`.
 * @returns A collapsible task container.
 */
export const Task = (props: TaskProps) => {
  const { defaultOpen = true, className, ...rest } = props;

  return (
    <Collapsible
      className={cn(className)}
      defaultOpen={defaultOpen}
      {...rest}
    />
  );
};

/** Props for the TaskTrigger component. */
export type TaskTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  title: string;
};

/**
 * Renders the clickable header that expands or collapses task content.
 *
 * @param props - Trigger props including the fallback `title`.
 * @returns A task trigger element.
 */
export const TaskTrigger = (props: TaskTriggerProps) => {
  const { children, className, title, ...rest } = props;

  return (
    <CollapsibleTrigger asChild className={cn("group", className)} {...rest}>
      {children ?? (
        <button
          className="flex w-full items-center gap-2 text-left text-muted-foreground text-sm transition-colors hover:text-foreground"
          type="button"
        >
          <SearchIcon aria-hidden="true" className="size-4" />
          <span className="text-sm">{title}</span>
          <ChevronDownIcon
            aria-hidden="true"
            className="size-4 motion-safe:transition-transform motion-reduce:transition-none group-data-[state=open]:rotate-180"
          />
        </button>
      )}
    </CollapsibleTrigger>
  );
};

/** Props for the TaskContent component. */
export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

/**
 * Renders the expandable body area for task details.
 *
 * @param props - Props forwarded to `CollapsibleContent`.
 * @returns A styled task content container.
 */
export const TaskContent = (props: TaskContentProps) => {
  const { children, className, ...rest } = props;

  return (
    <CollapsibleContent
      className={cn(
        "text-popover-foreground outline-none motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:slide-out-to-top-2 motion-safe:data-[state=open]:slide-in-from-top-2 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:animate-in motion-reduce:animate-none motion-reduce:transition-none",
        className,
      )}
      {...rest}
    >
      <div className="mt-4 space-y-2 border-muted border-l-2 pl-4">
        {children}
      </div>
    </CollapsibleContent>
  );
};
