"use client";

import { ChevronDownIcon, PaperclipIcon } from "lucide-react";
import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** A primitive message part used by queued messages. */
export interface QueueMessagePart {
  type: string;
  text?: string;
  url?: string;
  filename?: string;
  mediaType?: string;
}

/** A queued message displayed in the queue UI. */
export interface QueueMessage {
  id: string;
  parts: QueueMessagePart[];
}

/** A queued to-do item entry. */
export interface QueueTodo {
  id: string;
  title: string;
  description?: string;
  status?: "pending" | "completed";
}

/** Props for the QueueItem component. */
export type QueueItemProps = ComponentProps<"li">;

/**
 * Renders a queue list item container.
 *
 * @param props - `<li>` props for the queue item.
 * @returns A styled queue item element.
 */
export const QueueItem = (props: QueueItemProps) => {
  const { className, ...rest } = props;
  return (
    <li
      className={cn(
        "group flex flex-col gap-1 rounded-md px-3 py-1 text-sm transition-colors hover:bg-muted",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the QueueItemIndicator component. */
export type QueueItemIndicatorProps = ComponentProps<"span"> & {
  status?: "pending" | "completed";
};

/**
 * Renders a status dot for a queue item.
 *
 * @param props - Indicator props including queue status.
 * @returns A status indicator element.
 */
export const QueueItemIndicator = (props: QueueItemIndicatorProps) => {
  const { status = "pending", className, ...rest } = props;
  return (
    <span
      className={cn(
        "mt-0.5 inline-block size-2.5 rounded-full border",
        status === "completed"
          ? "border-muted-foreground/20 bg-muted-foreground/10"
          : "border-muted-foreground/50",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the QueueItemContent component. */
export type QueueItemContentProps = ComponentProps<"span"> & {
  status?: "pending" | "completed";
};

/**
 * Renders the main text content for a queue item.
 *
 * @param props - Content props including queue status.
 * @returns A styled queue item content element.
 */
export const QueueItemContent = (props: QueueItemContentProps) => {
  const { status = "pending", className, ...rest } = props;
  return (
    <span
      className={cn(
        "line-clamp-1 grow break-words",
        status === "completed"
          ? "text-muted-foreground/50 line-through"
          : "text-muted-foreground",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the QueueItemDescription component. */
export type QueueItemDescriptionProps = ComponentProps<"div"> & {
  status?: "pending" | "completed";
};

/**
 * Renders secondary description text for a queue item.
 *
 * @param props - Description props including queue status.
 * @returns A queue item description element.
 */
export const QueueItemDescription = (props: QueueItemDescriptionProps) => {
  const { status = "pending", className, ...rest } = props;
  return (
    <div
      className={cn(
        "ml-6 text-xs",
        status === "completed"
          ? "text-muted-foreground/40 line-through"
          : "text-muted-foreground",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the QueueItemActions component. */
export type QueueItemActionsProps = ComponentProps<"div">;

/**
 * Renders a container for queue item action buttons.
 *
 * @param props - Action container props.
 * @returns A queue item actions container.
 */
export const QueueItemActions = (props: QueueItemActionsProps) => {
  const { className, ...rest } = props;
  return <div className={cn("flex gap-1", className)} {...rest} />;
};

/** Props for the QueueItemAction component. */
export type QueueItemActionProps = Omit<
  ComponentProps<typeof Button>,
  "variant" | "size"
>;

/**
 * Renders an action button for a queue item.
 *
 * @param props - Button props for the action.
 * @returns A styled queue action button.
 */
export const QueueItemAction = (props: QueueItemActionProps) => {
  const { className, ...rest } = props;
  const accessibleLabel = rest["aria-label"] ?? "Queue item action";
  return (
    <Button
      aria-label={accessibleLabel}
      className={cn(
        "size-auto rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted-foreground/10 hover:text-foreground group-hover:opacity-100",
        className,
      )}
      size="icon"
      type="button"
      variant="ghost"
      {...rest}
    />
  );
};

/** Props for the QueueItemAttachment component. */
export type QueueItemAttachmentProps = ComponentProps<"div">;

/**
 * Renders a container for queue item attachments.
 *
 * @param props - Attachment container props.
 * @returns A queue attachment wrapper.
 */
export const QueueItemAttachment = (props: QueueItemAttachmentProps) => {
  const { className, ...rest } = props;
  return (
    <div className={cn("mt-1 flex flex-wrap gap-2", className)} {...rest} />
  );
};

/** Props for the QueueItemImage component. */
export type QueueItemImageProps = ComponentProps<typeof Image>;

/**
 * Renders a small preview image attachment.
 *
 * @param props - Image props for the attachment preview.
 * @returns An image element, or `null` when `src` is missing.
 */
export const QueueItemImage = (props: QueueItemImageProps) => {
  const { className, src, alt, ...rest } = props;
  if (!src) {
    return null;
  }

  const isBlob =
    typeof src === "string" &&
    (src.startsWith("blob:") || src.startsWith("data:"));

  return (
    <Image
      alt={alt ?? ""}
      className={cn("h-8 w-8 rounded border object-cover", className)}
      height={32}
      sizes="32px"
      src={src}
      unoptimized={isBlob}
      width={32}
      {...rest}
    />
  );
};

/** Props for the QueueItemFile component. */
export type QueueItemFileProps = ComponentProps<"span">;

/**
 * Renders a compact file attachment pill.
 *
 * @param props - File label props.
 * @returns A file attachment element.
 */
export const QueueItemFile = (props: QueueItemFileProps) => {
  const { children, className, ...rest } = props;
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded border bg-muted px-2 py-1 text-xs",
        className,
      )}
      {...rest}
    >
      <PaperclipIcon aria-hidden="true" size={12} />
      <span className="max-w-[100px] truncate">{children}</span>
    </span>
  );
};

/** Props for the QueueList component. */
export type QueueListProps = ComponentProps<typeof ScrollArea>;

/**
 * Renders the scrollable list region for queue items.
 *
 * @param props - Scroll area props.
 * @returns A queue list container.
 */
export const QueueList = (props: QueueListProps) => {
  const { children, className, ...rest } = props;
  return (
    <ScrollArea className={cn("mt-2 -mb-1", className)} {...rest}>
      <div className="max-h-40 pr-4">
        <ul>{children}</ul>
      </div>
    </ScrollArea>
  );
};

/** Props for the QueueSection component. */
export type QueueSectionProps = ComponentProps<typeof Collapsible>;

/**
 * Renders a collapsible queue section.
 *
 * @param props - Collapsible props for the section.
 * @returns A queue section container.
 */
export const QueueSection = (props: QueueSectionProps) => {
  const { className, defaultOpen = true, ...rest } = props;
  return (
    <Collapsible
      className={cn(className)}
      defaultOpen={defaultOpen}
      {...rest}
    />
  );
};

/** Props for the QueueSectionTrigger component. */
export type QueueSectionTriggerProps = ComponentProps<"button">;

/**
 * Renders the clickable trigger for a queue section.
 *
 * @param props - Button props for the section trigger.
 * @returns A queue section trigger button.
 */
export const QueueSectionTrigger = (props: QueueSectionTriggerProps) => {
  const { children, className, ...rest } = props;
  return (
    <CollapsibleTrigger asChild>
      <button
        className={cn(
          "group flex w-full items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-left font-medium text-muted-foreground text-sm transition-colors hover:bg-muted",
          className,
        )}
        type="button"
        {...rest}
      >
        {children}
      </button>
    </CollapsibleTrigger>
  );
};

/** Props for the QueueSectionLabel component. */
export type QueueSectionLabelProps = ComponentProps<"span"> & {
  count?: number;
  label: string;
  icon?: ReactNode;
};

/**
 * Renders section label content with optional count and icon.
 *
 * @param props - Label data and span props.
 * @returns A queue section label.
 */
export const QueueSectionLabel = (props: QueueSectionLabelProps) => {
  const { count, label, icon, className, ...rest } = props;
  return (
    <span className={cn("flex items-center gap-2", className)} {...rest}>
      <ChevronDownIcon
        aria-hidden="true"
        className="size-4 transition-transform group-data-[state=closed]:-rotate-90"
      />
      {icon}
      <span>{count === undefined ? label : `${count} ${label}`}</span>
    </span>
  );
};

/** Props for the QueueSectionContent component. */
export type QueueSectionContentProps = ComponentProps<
  typeof CollapsibleContent
>;

/**
 * Renders collapsible content for a queue section.
 *
 * @param props - Content props for the section body.
 * @returns A queue section content container.
 */
export const QueueSectionContent = (props: QueueSectionContentProps) => {
  const { className, ...rest } = props;
  return <CollapsibleContent className={cn(className)} {...rest} />;
};

/** Props for the Queue root container. */
export type QueueProps = ComponentProps<"div">;

/**
 * Renders the root container for the queue UI.
 *
 * @param props - Root container props.
 * @returns A queue root element.
 */
export const Queue = (props: QueueProps) => {
  const { className, ...rest } = props;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border bg-background px-3 pt-2 pb-2 shadow-xs",
        className,
      )}
      {...rest}
    />
  );
};
