"use client";

import { ArrowDownIcon, DownloadIcon } from "lucide-react";
import { type ComponentProps, createElement, type ReactNode } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Props for the Conversation component. */
export type ConversationProps = ComponentProps<typeof StickToBottom>;

/**
 * Provides the scroll container for chat messages with bottom-stick behavior.
 *
 * @param props - Props forwarded to `StickToBottom`.
 * @returns A stick-to-bottom conversation container.
 */
export const Conversation = (props: ConversationProps) => {
  const { className, "aria-label": ariaLabel, ...rest } = props;

  return (
    <StickToBottom
      aria-label={ariaLabel ?? "Conversation messages"}
      className={cn("relative flex-1 overflow-y-hidden", className)}
      initial="smooth"
      resize="smooth"
      role="log"
      {...rest}
    />
  );
};

/** Props for the ConversationContent component. */
export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

/**
 * Renders the message list wrapper inside the conversation container.
 *
 * @param props - Props forwarded to `StickToBottom.Content`.
 * @returns A content wrapper for conversation messages.
 */
export const ConversationContent = (props: ConversationContentProps) => {
  const { className, ...rest } = props;

  return (
    <StickToBottom.Content
      className={cn("flex flex-col gap-8 p-4", className)}
      {...rest}
    />
  );
};

/** Props for the ConversationEmptyState component. */
export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  headingTag?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  description?: string;
  icon?: ReactNode;
};

/**
 * Displays a centered placeholder when no conversation messages are present.
 *
 * @param props - Empty state content and container props.
 * @returns A conversation empty-state panel.
 */
export const ConversationEmptyState = (props: ConversationEmptyStateProps) => {
  const {
    className,
    title = "No messages yet",
    headingTag = "h3",
    description = "Start a conversation to see messages here",
    icon,
    children,
    ...rest
  } = props;

  return (
    <div
      className={cn(
        "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
        className,
      )}
      {...rest}
    >
      {children ?? (
        <>
          {icon ? <div className="text-muted-foreground">{icon}</div> : null}
          <div className="space-y-1">
            {createElement(
              headingTag,
              { className: "font-medium text-sm" },
              title,
            )}
            {description ? (
              <p className="text-muted-foreground text-sm">{description}</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};

/** Props for the ConversationScrollButton component. */
export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

/**
 * Renders a scroll-to-bottom button when the conversation is not at the bottom.
 *
 * @param props - Button props for the scroll control.
 * @returns A scroll button element or null when already at the bottom.
 */
export const ConversationScrollButton = (
  props: ConversationScrollButtonProps,
) => {
  const { className, ...rest } = props;
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return !isAtBottom ? (
    <Button
      aria-label="Scroll to latest message"
      className={cn(
        "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted",
        className,
      )}
      onClick={() => {
        void scrollToBottom();
      }}
      size="icon"
      type="button"
      variant="outline"
      {...rest}
    >
      <ArrowDownIcon aria-hidden="true" className="size-4" />
    </Button>
  ) : null;
};

/**
 * Conversation message shape for download exports.
 */
export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "data" | "tool";
  content: string;
}

/** Props for the ConversationDownload component. */
export type ConversationDownloadProps = Omit<
  ComponentProps<typeof Button>,
  "onClick"
> & {
  messages: ConversationMessage[];
  filename?: string;
  formatMessage?: (message: ConversationMessage, index: number) => string;
};

const defaultFormatMessage = (message: ConversationMessage): string => {
  const roleLabel =
    message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${message.content}`;
};

/**
 * Convert conversation messages into Markdown.
 *
 * @param messages - Messages to format.
 * @param formatMessage - Optional formatting callback.
 * @returns A Markdown string representation of the conversation.
 */
export const messagesToMarkdown = (
  messages: ConversationMessage[],
  formatMessage: (
    message: ConversationMessage,
    index: number,
  ) => string = defaultFormatMessage,
): string => messages.map((msg, i) => formatMessage(msg, i)).join("\n\n");

/**
 * Download button that exports the conversation as Markdown.
 *
 * @param props - Download props including messages and filename.
 * @returns A download button that triggers a Markdown export.
 */
export const ConversationDownload = (props: ConversationDownloadProps) => {
  const {
    messages,
    filename = "conversation.md",
    formatMessage = defaultFormatMessage,
    className,
    children,
    ...rest
  } = props;
  const handleDownload = () => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const ariaLabel = rest["aria-label"] ?? "Download conversation as Markdown";

  return (
    <Button
      aria-label={ariaLabel}
      className={cn(
        "absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted",
        className,
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...rest}
    >
      {children ?? <DownloadIcon aria-hidden="true" className="size-4" />}
    </Button>
  );
};
