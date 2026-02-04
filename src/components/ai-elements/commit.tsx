"use client";

import {
  CheckIcon,
  CopyIcon,
  FileIcon,
  GitCommitIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";
import {
  type ComponentProps,
  type HTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const moduleNow = Date.now();

/**
 * Props for the Commit component.
 */
export type CommitProps = ComponentProps<typeof Collapsible>;

/**
 * Root container for a git commit representation.
 *
 * @param props - Component properties including children and className.
 * @returns The rendered commit container.
 */
export const Commit = (props: CommitProps) => {
  const { className, children, ...rest } = props;
  return (
    <Collapsible
      className={cn("rounded-lg border bg-background", className)}
      {...rest}
    >
      {children}
    </Collapsible>
  );
};

/**
 * Props for the CommitHeader component.
 */
export type CommitHeaderProps = ComponentProps<typeof CollapsibleTrigger>;

/**
 * Header section of a commit, typically containing the hash and message.
 *
 * @param props - Component properties including children and className.
 * @returns The rendered commit header.
 */
export const CommitHeader = (props: CommitHeaderProps) => {
  const { className, children, ...rest } = props;
  return (
    <CollapsibleTrigger asChild {...rest}>
      <button
        className={cn(
          "group flex cursor-pointer items-center justify-between gap-4 p-3 text-left transition-colors hover:opacity-80",
          className,
        )}
        type="button"
      >
        {children}
      </button>
    </CollapsibleTrigger>
  );
};

/**
 * Props for the CommitHash component.
 */
export type CommitHashProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Displays the short hash of a commit.
 *
 * @param props - Component properties including children (the hash) and className.
 * @returns The rendered commit hash.
 */
export const CommitHash = (props: CommitHashProps) => {
  const { className, children, ...rest } = props;
  return (
    <span className={cn("font-mono text-xs", className)} {...rest}>
      <GitCommitIcon aria-hidden="true" className="mr-1 inline-block size-3" />
      {children}
    </span>
  );
};

/**
 * Props for the CommitMessage component.
 */
export type CommitMessageProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Displays the commit message.
 *
 * @param props - Component properties including children (the message) and className.
 * @returns The rendered commit message.
 */
export const CommitMessage = (props: CommitMessageProps) => {
  const { className, children, ...rest } = props;
  return (
    <span className={cn("font-medium text-sm", className)} {...rest}>
      {children}
    </span>
  );
};

/**
 * Props for the CommitMetadata component.
 */
export type CommitMetadataProps = HTMLAttributes<HTMLDivElement>;

/**
 * Container for commit metadata like author and timestamp.
 *
 * @param props - Component properties including children and className.
 * @returns The rendered commit metadata container.
 */
export const CommitMetadata = (props: CommitMetadataProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-muted-foreground text-xs",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

/**
 * Props for the CommitSeparator component.
 */
export type CommitSeparatorProps = HTMLAttributes<HTMLSpanElement>;

/**
 * A separator for commit metadata items.
 *
 * @param props - Component properties including children and className. Defaults to a bullet point.
 * @returns The rendered commit separator.
 */
export const CommitSeparator = (props: CommitSeparatorProps) => {
  const { className, children, ...rest } = props;
  return (
    <span className={className} {...rest}>
      {children ?? "•"}
    </span>
  );
};

/**
 * Props for the CommitInfo component.
 */
export type CommitInfoProps = HTMLAttributes<HTMLDivElement>;

/**
 * Detailed information section for a commit.
 *
 * @param props - Component properties including children and className.
 * @returns The rendered commit info container.
 */
export const CommitInfo = (props: CommitInfoProps) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("flex flex-1 flex-col", className)} {...rest}>
      {children}
    </div>
  );
};

/**
 * Props for the CommitAuthor component.
 */
export type CommitAuthorProps = HTMLAttributes<HTMLDivElement>;

/**
 * Displays the author of a commit.
 *
 * @param props - Component properties including children and className.
 * @returns The rendered commit author.
 */
export const CommitAuthor = (props: CommitAuthorProps) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("flex items-center", className)} {...rest}>
      {children}
    </div>
  );
};

/**
 * Props for the CommitAuthorAvatar component.
 */
export type CommitAuthorAvatarProps = ComponentProps<typeof Avatar> & {
  /** The initials of the author to display as a fallback. */
  initials: string;
};

/**
 * Displays the author's avatar or initials.
 *
 * @param props - Component properties including initials, className, and Avatar props.
 * @returns The rendered author avatar.
 */
export const CommitAuthorAvatar = (props: CommitAuthorAvatarProps) => {
  const { initials, className, ...rest } = props;
  return (
    <Avatar className={cn("size-8", className)} {...rest}>
      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
    </Avatar>
  );
};

/**
 * Props for the CommitTimestamp component.
 */
export type CommitTimestampProps = HTMLAttributes<HTMLTimeElement> & {
  /** The date of the commit. */
  date: Date;
};

/**
 * Displays the timestamp of a commit, formatted relatively.
 *
 * @param props - Component properties including date, children, and className.
 * @returns The rendered commit timestamp.
 */
export const CommitTimestamp = (props: CommitTimestampProps) => {
  const { date, className, children, ...rest } = props;
  const now = moduleNow;
  const diffSeconds = Math.round((date.getTime() - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const [value, unit] =
    absSeconds < 60
      ? [diffSeconds, "second"]
      : absSeconds < 60 * 60
        ? [Math.round(diffSeconds / 60), "minute"]
        : absSeconds < 60 * 60 * 24
          ? [Math.round(diffSeconds / (60 * 60)), "hour"]
          : [Math.round(diffSeconds / (60 * 60 * 24)), "day"];
  const formatted = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  }).format(value, unit as Intl.RelativeTimeFormatUnit);

  return (
    <time
      className={cn("text-xs", className)}
      dateTime={date.toISOString()}
      suppressHydrationWarning
      {...rest}
    >
      {children ?? formatted}
    </time>
  );
};

/**
 * Props for the CommitActions component.
 */
export type CommitActionsProps = HTMLAttributes<HTMLFieldSetElement>;

/**
 * Container for action buttons related to a commit.
 *
 * @param props - Component properties including children and className.
 * @returns The rendered commit actions container.
 */
export const CommitActions = (props: CommitActionsProps) => {
  const { className, children, onClick, onKeyDown, ...rest } = props;
  return (
    <fieldset
      className={cn(
        "m-0 flex min-w-0 items-center gap-1 border-0 p-0",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        onKeyDown?.(event);
      }}
      {...rest}
    >
      {children}
    </fieldset>
  );
};

/**
 * Props for the CommitCopyButton component.
 */
export type CommitCopyButtonProps = ComponentProps<typeof Button> & {
  /** The commit hash to copy to the clipboard. */
  hash: string;
  /** Callback fired when the hash is successfully copied. */
  onCopy?: () => void;
  /** Callback fired when an error occurs during copying. */
  onError?: (error: Error) => void;
  /** Timeout in milliseconds before resetting the copy state. Defaults to 2000. */
  timeout?: number;
};

/**
 * A button to copy the commit hash to the clipboard.
 *
 * @param props - Component properties including hash, onCopy, onError, timeout, children, and className.
 * @returns The rendered copy button.
 */
export const CommitCopyButton = (props: CommitCopyButtonProps) => {
  const {
    hash,
    onCopy,
    onError,
    timeout = 2000,
    children,
    className,
    ...rest
  } = props;
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    try {
      if (!isCopied) {
        await navigator.clipboard.writeText(hash);
        setIsCopied(true);
        onCopy?.();
        timeoutRef.current = window.setTimeout(
          () => setIsCopied(false),
          timeout,
        );
      }
    } catch (error) {
      onError?.(error as Error);
    }
  };

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      aria-label={isCopied ? "Copied commit hash" : "Copy commit hash"}
      className={cn("size-7 shrink-0", className)}
      onClick={() => {
        void copyToClipboard();
      }}
      size="icon"
      variant="ghost"
      {...rest}
    >
      {children ?? <Icon aria-hidden="true" size={14} />}
    </Button>
  );
};

/**
 * Props for the CommitContent component.
 */
export type CommitContentProps = ComponentProps<typeof CollapsibleContent>;

/**
 * Expandable content area for a commit, typically containing file changes.
 *
 * @param props - Component properties including children and className.
 * @returns The rendered commit content.
 */
export const CommitContent = (props: CommitContentProps) => {
  const { className, children, ...rest } = props;
  return (
    <CollapsibleContent className={cn("border-t p-3", className)} {...rest}>
      {children}
    </CollapsibleContent>
  );
};

/**
 * Props for the CommitFiles component.
 */
export type CommitFilesProps = HTMLAttributes<HTMLDivElement>;

/**
 * List of files changed in a commit.
 *
 * @param props - Component properties including children and className.
 * @returns The rendered commit files list.
 */
export const CommitFiles = (props: CommitFilesProps) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("space-y-1", className)} {...rest}>
      {children}
    </div>
  );
};

/**
 * Props for the CommitFile component.
 */
export type CommitFileProps = HTMLAttributes<HTMLDivElement>;

/**
 * Represents a single file changed in a commit.
 *
 * @param props - Component properties including children and className.
 * @returns The rendered commit file item.
 */
export const CommitFile = (props: CommitFileProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

/**
 * Props for the CommitFileInfo component.
 */
export type CommitFileInfoProps = HTMLAttributes<HTMLDivElement>;

/**
 * Displays information about a changed file like status and icon.
 *
 * @param props - Component properties including children and className.
 * @returns The rendered commit file info.
 */
export const CommitFileInfo = (props: CommitFileInfoProps) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)} {...rest}>
      {children}
    </div>
  );
};

const fileStatusStyles = {
  added: "text-green-600 dark:text-green-400",
  deleted: "text-red-600 dark:text-red-400",
  modified: "text-yellow-600 dark:text-yellow-400",
  renamed: "text-blue-600 dark:text-blue-400",
};

const fileStatusLabels = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
};

const fileStatusAccessibleLabels = {
  added: "Added",
  deleted: "Deleted",
  modified: "Modified",
  renamed: "Renamed",
};

/**
 * Props for the CommitFileStatus component.
 */
export type CommitFileStatusProps = HTMLAttributes<HTMLSpanElement> & {
  /** The type of change: added, modified, deleted, or renamed. */
  status: "added" | "modified" | "deleted" | "renamed";
};

/**
 * Displays the status (e.g., A, M, D, R) of a file change.
 *
 * @param props - Component properties including status, children, and className.
 * @returns The rendered commit file status.
 */
export const CommitFileStatus = (props: CommitFileStatusProps) => {
  const { status, className, children, ...rest } = props;
  const accessibleLabel = fileStatusAccessibleLabels[status];
  const resolvedChildren = children ?? (
    <>
      <span aria-hidden="true">{fileStatusLabels[status]}</span>
      <span className="sr-only">{accessibleLabel}</span>
    </>
  );

  return (
    <span
      className={cn(
        "font-medium font-mono text-xs",
        fileStatusStyles[status],
        className,
      )}
      title={accessibleLabel}
      {...rest}
    >
      {resolvedChildren}
    </span>
  );
};

/**
 * Props for the CommitFileIcon component.
 */
export type CommitFileIconProps = ComponentProps<typeof FileIcon>;

/**
 * Displays the icon for a changed file.
 *
 * @param props - Component properties including className and FileIcon props.
 * @returns The rendered commit file icon.
 */
export const CommitFileIcon = (props: CommitFileIconProps) => {
  const { className, ...rest } = props;
  return (
    <FileIcon
      className={cn("size-3.5 shrink-0 text-muted-foreground", className)}
      {...rest}
      aria-hidden={true}
    />
  );
};

/**
 * Props for the CommitFilePath component.
 */
export type CommitFilePathProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Displays the path of a changed file.
 *
 * @param props - Component properties including children and className.
 * @returns The rendered commit file path.
 */
export const CommitFilePath = (props: CommitFilePathProps) => {
  const { className, children, ...rest } = props;
  return (
    <span className={cn("truncate font-mono text-xs", className)} {...rest}>
      {children}
    </span>
  );
};

/**
 * Props for the CommitFileChanges component.
 */
export type CommitFileChangesProps = HTMLAttributes<HTMLDivElement>;

/**
 * Container for addition and deletion counts of a file change.
 *
 * @param props - Component properties including children and className.
 * @returns The rendered commit file changes container.
 */
export const CommitFileChanges = (props: CommitFileChangesProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 font-mono text-xs",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

/**
 * Props for the CommitFileAdditions component.
 */
export type CommitFileAdditionsProps = HTMLAttributes<HTMLSpanElement> & {
  /** The number of lines added. */
  count: number;
};

/**
 * Displays the number of lines added in a file change.
 *
 * @param props - Component properties including count, children, and className.
 * @returns The rendered commit file additions count.
 */
export const CommitFileAdditions = (props: CommitFileAdditionsProps) => {
  const { count, className, children, ...rest } = props;
  if (count <= 0) {
    return null;
  }

  return (
    <span
      className={cn("text-green-600 dark:text-green-400", className)}
      {...rest}
    >
      {children ?? (
        <>
          <PlusIcon aria-hidden="true" className="inline-block size-3" />
          {count}
        </>
      )}
    </span>
  );
};

/**
 * Props for the CommitFileDeletions component.
 */
export type CommitFileDeletionsProps = HTMLAttributes<HTMLSpanElement> & {
  /** The number of lines deleted. */
  count: number;
};

/**
 * Displays the number of lines deleted in a file change.
 *
 * @param props - Component properties including count, children, and className.
 * @returns The rendered commit file deletions count.
 */
export const CommitFileDeletions = (props: CommitFileDeletionsProps) => {
  const { count, className, children, ...rest } = props;
  if (count <= 0) {
    return null;
  }

  return (
    <span className={cn("text-red-600 dark:text-red-400", className)} {...rest}>
      {children ?? (
        <>
          <MinusIcon aria-hidden="true" className="inline-block size-3" />
          {count}
        </>
      )}
    </span>
  );
};
