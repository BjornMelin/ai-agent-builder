"use client";

import { ArrowDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
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
  const { className, ...rest } = props;

  return (
    <StickToBottom
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
            <h3 className="font-medium text-sm">{title}</h3>
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
      <ArrowDownIcon className="size-4" />
    </Button>
  ) : null;
};
