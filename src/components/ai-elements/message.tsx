"use client";

import type { UIMessage } from "ai";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  Children,
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  type ReactElement,
  useContext,
  useEffect,
  useState,
} from "react";
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
 * Renders the root container for a chat message.
 *
 * @param props - Message container props.
 * @returns The message container.
 */
export const Message = (props: MessageProps) => {
  const { className, from, ...rest } = props;
  return (
    <div
      className={cn(
        "group flex w-full max-w-[95%] flex-col gap-2",
        from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
        className,
      )}
      {...rest}
    />
  );
};

/**
 * Props for the MessageContent component.
 */
export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the main message content area.
 *
 * @param props - Message content props.
 * @returns The message content element.
 */
export const MessageContent = (props: MessageContentProps) => {
  const { children, className, ...rest } = props;
  return (
    <div
      className={cn(
        "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
        "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
        "group-[.is-assistant]:text-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

/**
 * Props for the MessageActions component.
 */
export type MessageActionsProps = ComponentProps<"div">;

/**
 * Renders a container for message action buttons.
 *
 * @param props - Actions container props.
 * @returns The actions container.
 */
export const MessageActions = (props: MessageActionsProps) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("flex items-center gap-1", className)} {...rest}>
      {children}
    </div>
  );
};

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
 * Renders a message action button with optional tooltip.
 *
 * @param props - Action button props.
 * @returns The action button element.
 */
export const MessageAction = (props: MessageActionProps) => {
  const {
    tooltip,
    children,
    label,
    variant = "ghost",
    size = "icon-sm",
    ...rest
  } = props;
  const fallbackLabel =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : "Message action";
  const accessibleLabel = label ?? tooltip ?? fallbackLabel;

  if (
    process.env.NODE_ENV !== "production" &&
    label === undefined &&
    tooltip === undefined
  ) {
    console.warn(
      "[MessageAction] Missing both label and tooltip; using fallback accessible label.",
    );
  }

  const button = (
    <Button
      aria-label={accessibleLabel}
      size={size}
      type="button"
      variant={variant}
      {...rest}
    >
      {children}
      <span className="sr-only">{accessibleLabel}</span>
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
 * Provides branch state for multi-version messages.
 *
 * @param props - Branch container props.
 * @returns The branch context provider.
 */
export const MessageBranch = (props: MessageBranchProps) => {
  const { defaultBranch = 0, onBranchChange, className, ...rest } = props;
  const safeDefaultBranch = Math.max(0, defaultBranch);
  const [currentBranch, setCurrentBranch] = useState(safeDefaultBranch);
  const [branches, setBranches] = useState<ReactElement[]>([]);
  const totalBranches = branches.length;
  const activeBranch =
    totalBranches > 0
      ? Math.max(0, Math.min(currentBranch, totalBranches - 1))
      : 0;

  const handleBranchChange = (newBranch: number) => {
    const safeBranch = Math.max(0, newBranch);
    setCurrentBranch(safeBranch);
    onBranchChange?.(safeBranch);
  };

  const goToPrevious = () => {
    if (totalBranches <= 1) {
      return;
    }
    const newBranch = activeBranch > 0 ? activeBranch - 1 : totalBranches - 1;
    handleBranchChange(newBranch);
  };

  const goToNext = () => {
    if (totalBranches <= 1) {
      return;
    }
    const newBranch = activeBranch < totalBranches - 1 ? activeBranch + 1 : 0;
    handleBranchChange(newBranch);
  };

  const contextValue: MessageBranchContextType = {
    branches,
    currentBranch: activeBranch,
    goToNext,
    goToPrevious,
    setBranches,
    totalBranches,
  };

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
        {...rest}
      />
    </MessageBranchContext.Provider>
  );
};

/**
 * Props for the MessageBranchContent component.
 */
export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders only the currently selected branch content.
 *
 * @param props - Branch content props.
 * @returns A list containing visible branch content wrappers.
 */
export const MessageBranchContent = (props: MessageBranchContentProps) => {
  const { children, ...rest } = props;
  const { currentBranch, setBranches } = useMessageBranch();
  const childrenArray = Children.toArray(children).filter(
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
      {...rest}
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
 * Renders branch navigation controls when multiple branches exist.
 *
 * @param props - Branch selector props.
 * @returns The selector or `null` when only one branch exists.
 */
export const MessageBranchSelector = (props: MessageBranchSelectorProps) => {
  const { className, from: _from, ...rest } = props;
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
      {...rest}
    />
  );
};

/**
 * Props for the MessageBranchPrevious component.
 */
export type MessageBranchPreviousProps = ComponentProps<typeof Button>;

/**
 * Renders a button that selects the previous branch.
 *
 * @param props - Previous-button props.
 * @returns The previous branch button.
 */
export const MessageBranchPrevious = (props: MessageBranchPreviousProps) => {
  const { children, ...rest } = props;
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...rest}
    >
      {children ?? <ChevronLeftIcon aria-hidden="true" size={14} />}
    </Button>
  );
};

/**
 * Props for the MessageBranchNext component.
 */
export type MessageBranchNextProps = ComponentProps<typeof Button>;

/**
 * Renders a button that selects the next branch.
 *
 * @param props - Next-button props.
 * @returns The next branch button.
 */
export const MessageBranchNext = (props: MessageBranchNextProps) => {
  const { children, ...rest } = props;
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...rest}
    >
      {children ?? <ChevronRightIcon aria-hidden="true" size={14} />}
    </Button>
  );
};

/**
 * Props for the MessageBranchPage component.
 */
export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Renders the current branch position text.
 *
 * @param props - Page indicator props.
 * @returns The branch page indicator.
 */
export const MessageBranchPage = (props: MessageBranchPageProps) => {
  const { className, ...rest } = props;
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn(
        "border-none bg-transparent text-muted-foreground shadow-none",
        className,
      )}
      {...rest}
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
 * Renders assistant response content using Streamdown.
 *
 * @param props - Streamdown renderer props.
 * @returns The rendered response content.
 */
export const MessageResponse = (props: MessageResponseProps) => {
  const { className, ...rest } = props;
  return (
    <StreamdownRenderer
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      {...rest}
    />
  );
};

/**
 * Props for the MessageToolbar component.
 */
export type MessageToolbarProps = ComponentProps<"div">;

/**
 * Renders a toolbar row for message-level controls.
 *
 * @param props - Toolbar props.
 * @returns The message toolbar.
 */
export const MessageToolbar = (props: MessageToolbarProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn(
        "mt-4 flex w-full items-center justify-between gap-4",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};
