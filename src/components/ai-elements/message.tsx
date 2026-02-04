"use client";

import type { UIMessage } from "ai";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import React, {
  createContext,
  memo,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ComponentProps, HTMLAttributes, ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { StreamdownRenderer } from "./streamdown-renderer";

/**
 * Props for the Message component.
 */
export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  /** The role of the message sender (user or assistant). */
  from: UIMessage["role"];
};

/**
 * Root container for a chat message.
 * @param {object} props - Component properties.
 * @returns {JSX.Element} The rendered message container.
 */
export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className,
    )}
    {...props}
  />
);

/**
 * Props for the MessageContent component.
 */
export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

/**
 * Main content area of a message, with distinct styling for user and assistant.
 * @param {object} props - Component properties.
 * @returns {JSX.Element} The rendered message content.
 */
export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

/**
 * Props for the MessageActions component.
 */
export type MessageActionsProps = ComponentProps<"div">;

/**
 * Container for action buttons associated with a message.
 * @param {object} props - Component properties.
 * @returns {JSX.Element} The rendered actions container.
 */
export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

/**
 * Props for an individual MessageAction.
 */
export type MessageActionProps = ComponentProps<typeof Button> & {
  /** Optional tooltip text to display on hover. */
  tooltip?: string;
  /** Accessible label for the action. */
  label?: string;
};

/**
 * An action button for a message, optionally with a tooltip.
 * @param {object} props - Component properties.
 * @returns {JSX.Element} The rendered action button.
 */
export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

/**
 * Context type for managing message branches (e.g., version history).
 */
export interface MessageBranchContextType {
  currentBranch: number;
  totalBranches: number;
  goToPrevious: () => void;
  goToNext: () => void;
  branches: ReactElement[];
  setBranches: (branches: ReactElement[]) => void;
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null,
);

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (!context) {
    throw new Error(
      "MessageBranch components must be used within MessageBranch",
    );
  }

  return context;
};

/**
 * Props for the MessageBranch component.
 */
export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  /** Initial branch index to display. Defaults to 0. */
  defaultBranch?: number;
  /** Callback fired when the active branch changes. */
  onBranchChange?: (branchIndex: number) => void;
};

/**
 * Provides context for multi-branch messages (e.g., edited responses).
 * @param {object} props - Component properties.
 * @returns {JSX.Element} The rendered branch provider.
 */
export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);
  const [branches, setBranches] = useState<ReactElement[]>([]);

  const handleBranchChange = React.useCallback(
    (newBranch: number) => {
      setCurrentBranch(newBranch);
      onBranchChange?.(newBranch);
    },
    [onBranchChange],
  );

  useEffect(() => {
    if (branches.length > 0) {
      const clampedBranch = Math.max(
        0,
        Math.min(currentBranch, branches.length - 1),
      );
      if (clampedBranch !== currentBranch) {
        handleBranchChange(clampedBranch);
      }
    }
  }, [branches.length, currentBranch, handleBranchChange]);

  const goToPrevious = () => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
    handleBranchChange(newBranch);
  };

  const goToNext = () => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
    handleBranchChange(newBranch);
  };

  const contextValue: MessageBranchContextType = {
    branches,
    currentBranch,
    goToNext,
    goToPrevious,
    setBranches,
    totalBranches: branches.length,
  };

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
        {...props}
      />
    </MessageBranchContext.Provider>
  );
};

/**
 * Props for the MessageBranchContent component.
 */
export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

/**
 * Render the content of the currently active branch.
 * @param {object} props - Component properties.
 * @returns {JSX.Element[]} The rendered branch content list.
 */
export const MessageBranchContent = ({
  children,
  ...props
}: MessageBranchContentProps) => {
  const { currentBranch, setBranches } = useMessageBranch();
  const childrenArray = React.Children.toArray(children).filter(
    Boolean,
  ) as ReactElement[];

  useEffect(() => {
    setBranches(childrenArray);
  }, [childrenArray, setBranches]);

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden",
      )}
      key={branch.key ?? index}
      {...props}
    >
      {branch}
    </div>
  ));
};

/**
 * Props for the MessageBranchSelector component.
 */
export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup> & {
  /** The role of the message sender. */
  from: UIMessage["role"];
};

/**
 * A selector for navigating between different message branches.
 * @param {object} props - Component properties.
 * @returns {JSX.Element | null} The rendered branch selector or null if only one branch exists.
 */
export const MessageBranchSelector = ({
  className,
  from: _from,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch();

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className={cn(
        "[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md",
        className,
      )}
      orientation="horizontal"
      {...props}
    />
  );
};

/**
 * Props for the MessageBranchPrevious component.
 */
export type MessageBranchPreviousProps = ComponentProps<typeof Button>;

/**
 * A button to navigate to the previous message branch.
 * @param {object} props - Component properties.
 * @returns {JSX.Element} The rendered previous button.
 */
export const MessageBranchPrevious = ({
  children,
  ...props
}: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  );
};

/**
 * Props for the MessageBranchNext component.
 */
export type MessageBranchNextProps = ComponentProps<typeof Button>;

/**
 * A button to navigate to the next message branch.
 * @param {object} props - Component properties.
 * @returns {JSX.Element} The rendered next button.
 */
export const MessageBranchNext = ({
  children,
  ...props
}: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  );
};

/**
 * Props for the MessageBranchPage component.
 */
export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Displays the current branch index and total number of branches.
 * @param {object} props - Component properties.
 * @returns {JSX.Element} The rendered page indicator.
 */
export const MessageBranchPage = ({
  className,
  ...props
}: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn(
        "border-none bg-transparent text-muted-foreground shadow-none",
        className,
      )}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  );
};

/**
 * Props for the MessageResponse component.
 */
export type MessageResponseProps = ComponentProps<typeof StreamdownRenderer>;

/**
 * Renders the body of an assistant message using Streamdown.
 * @param {object} props - Component properties.
 * @returns {JSX.Element} The rendered message response.
 */
export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <StreamdownRenderer
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

MessageResponse.displayName = "MessageResponse";

/**
 * Props for the MessageToolbar component.
 */
export type MessageToolbarProps = ComponentProps<"div">;

/**
 * A toolbar for message actions, typically displayed at the bottom.
 * @param {object} props - Component properties.
 * @returns {JSX.Element} The rendered message toolbar.
 */
export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "mt-4 flex w-full items-center justify-between gap-4",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
