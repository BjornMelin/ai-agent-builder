"use client";

import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
} from "lucide-react";
import type { ComponentProps } from "react";
import { createContext, memo, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useControllableState } from "./use-controllable-state";

// Regex patterns for parsing stack traces
const STACK_FRAME_WITH_PARENS_REGEX = /^at\s+(.+?)\s+\((.+):(\d+):(\d+)\)$/;
const STACK_FRAME_WITHOUT_FN_REGEX = /^at\s+(.+):(\d+):(\d+)$/;
const ERROR_TYPE_REGEX = /^(\w+Error|Error):\s*(.*)$/;
const AT_PREFIX_REGEX = /^at\s+/;

interface StackFrame {
  raw: string;
  functionName: string | null;
  filePath: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  isInternal: boolean;
}

interface ParsedStackTrace {
  errorType: string | null;
  errorMessage: string;
  frames: StackFrame[];
  raw: string;
}

interface StackTraceContextValue {
  trace: ParsedStackTrace;
  raw: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onFilePathClick?: (filePath: string, line?: number, column?: number) => void;
}

const StackTraceContext = createContext<StackTraceContextValue | null>(null);

const useStackTrace = () => {
  const context = useContext(StackTraceContext);
  if (!context) {
    throw new Error("StackTrace components must be used within StackTrace");
  }
  return context;
};

const parseStackFrame = (line: string): StackFrame => {
  const trimmed = line.trim();

  // Pattern: at functionName (filePath:line:column)
  const withParensMatch = trimmed.match(STACK_FRAME_WITH_PARENS_REGEX);
  if (withParensMatch) {
    const [, functionName, filePath, lineNum, colNum] = withParensMatch;
    const filePathValue = filePath ?? "";
    const isInternal =
      filePathValue.includes("node_modules") ||
      filePathValue.startsWith("node:") ||
      filePathValue.includes("internal/");
    return {
      columnNumber: colNum ? Number.parseInt(colNum, 10) : null,
      filePath: filePath ?? null,
      functionName: functionName ?? null,
      isInternal,
      lineNumber: lineNum ? Number.parseInt(lineNum, 10) : null,
      raw: trimmed,
    };
  }

  // Pattern: at filePath:line:column (no function name)
  const withoutFnMatch = trimmed.match(STACK_FRAME_WITHOUT_FN_REGEX);
  if (withoutFnMatch) {
    const [, filePath, lineNum, colNum] = withoutFnMatch;
    const isInternal =
      (filePath?.includes("node_modules") ?? false) ||
      (filePath?.startsWith("node:") ?? false) ||
      (filePath?.includes("internal/") ?? false);
    return {
      columnNumber: colNum ? Number.parseInt(colNum, 10) : null,
      filePath: filePath ?? null,
      functionName: null,
      isInternal,
      lineNumber: lineNum ? Number.parseInt(lineNum, 10) : null,
      raw: trimmed,
    };
  }

  // Fallback: unparseable line
  return {
    columnNumber: null,
    filePath: null,
    functionName: null,
    isInternal: trimmed.includes("node_modules") || trimmed.includes("node:"),
    lineNumber: null,
    raw: trimmed,
  };
};

const parseStackTrace = (trace: string): ParsedStackTrace => {
  const lines = trace.split("\n").filter((line) => line.trim());

  if (lines.length === 0) {
    return {
      errorMessage: trace,
      errorType: null,
      frames: [],
      raw: trace,
    };
  }

  const firstLine = (lines[0] ?? "").trim();
  let errorType: string | null = null;
  let errorMessage = firstLine;

  // Try to extract error type from "ErrorType: message" format
  const errorMatch = firstLine.match(ERROR_TYPE_REGEX);
  if (errorMatch) {
    errorType = errorMatch[1] ?? null;
    errorMessage = errorMatch[2] ?? "";
  }

  // Parse stack frames (lines starting with "at")
  const frames = lines
    .slice(1)
    .filter((line) => line.trim().startsWith("at "))
    .map(parseStackFrame);

  return {
    errorMessage,
    errorType,
    frames,
    raw: trace,
  };
};

/** Props for the StackTrace component. */
export type StackTraceProps = ComponentProps<"div"> & {
  trace: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onFilePathClick?: (filePath: string, line?: number, column?: number) => void;
};

/**
 * Renders a collapsible stack trace viewer.
 *
 * @param props - Stack trace props including trace text and open state.
 * @returns A stack trace container with context.
 */
export const StackTrace = memo((props: StackTraceProps) => {
  const {
    trace,
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    onFilePathClick,
    children,
    ...rest
  } = props;
  const [isOpen, setIsOpen] = useControllableState({
    defaultProp: defaultOpen,
    prop: open,
    ...(onOpenChange === undefined ? {} : { onChange: onOpenChange }),
  });

  const parsedTrace = parseStackTrace(trace);

  const contextValue: StackTraceContextValue = {
    isOpen,
    raw: trace,
    setIsOpen,
    trace: parsedTrace,
    ...(onFilePathClick === undefined ? {} : { onFilePathClick }),
  };

  return (
    <StackTraceContext.Provider value={contextValue}>
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <div
          className={cn(
            "not-prose w-full overflow-hidden rounded-lg border bg-background font-mono text-sm",
            className,
          )}
          {...rest}
        >
          {children}
        </div>
      </Collapsible>
    </StackTraceContext.Provider>
  );
});

/** Props for the StackTraceHeader component. */
export type StackTraceHeaderProps = ComponentProps<typeof CollapsibleTrigger>;

/**
 * Renders the header trigger for expanding the stack trace.
 *
 * @param props - Trigger props and optional children.
 * @returns A collapsible trigger element.
 */
export const StackTraceHeader = memo((props: StackTraceHeaderProps) => {
  const { className, children, ...rest } = props;
  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50",
        className,
      )}
      {...rest}
    >
      {children}
    </CollapsibleTrigger>
  );
});

/** Props for the StackTraceError component. */
export type StackTraceErrorProps = ComponentProps<"div">;

/**
 * Renders the error summary row.
 *
 * @param props - Div props and optional children.
 * @returns An error summary element.
 */
export const StackTraceError = memo((props: StackTraceErrorProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-2 overflow-hidden",
        className,
      )}
      {...rest}
    >
      <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
      {children}
    </div>
  );
});

/** Props for the StackTraceErrorType component. */
export type StackTraceErrorTypeProps = ComponentProps<"span">;

/**
 * Renders the error type label.
 *
 * @param props - Span props and optional children.
 * @returns An error type element.
 */
export const StackTraceErrorType = memo((props: StackTraceErrorTypeProps) => {
  const { className, children, ...rest } = props;
  const { trace } = useStackTrace();

  return (
    <span
      className={cn("shrink-0 font-semibold text-destructive", className)}
      {...rest}
    >
      {children ?? trace.errorType}
    </span>
  );
});

/** Props for the StackTraceErrorMessage component. */
export type StackTraceErrorMessageProps = ComponentProps<"span">;

/**
 * Renders the error message text.
 *
 * @param props - Span props and optional children.
 * @returns An error message element.
 */
export const StackTraceErrorMessage = memo(
  (props: StackTraceErrorMessageProps) => {
    const { className, children, ...rest } = props;
    const { trace } = useStackTrace();

    return (
      <span className={cn("truncate text-foreground", className)} {...rest}>
        {children ?? trace.errorMessage}
      </span>
    );
  },
);

/** Props for the StackTraceActions component. */
export type StackTraceActionsProps = ComponentProps<"fieldset">;

/**
 * Renders an actions container for stack trace controls.
 *
 * @param props - Fieldset props and optional children.
 * @returns An actions container element.
 */
export const StackTraceActions = memo((props: StackTraceActionsProps) => {
  const { className, children, ...rest } = props;
  return (
    <fieldset
      className={cn(
        "m-0 flex min-w-0 shrink-0 items-center gap-1 border-0 p-0",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
        }
      }}
      {...rest}
    >
      {children}
    </fieldset>
  );
});

/** Props for the StackTraceCopyButton component. */
export type StackTraceCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

/**
 * Renders a copy-to-clipboard button for the raw stack trace.
 *
 * @param props - Button props including copy handlers.
 * @returns A copy button element.
 */
export const StackTraceCopyButton = memo((props: StackTraceCopyButtonProps) => {
  const {
    onCopy,
    onError,
    timeout = 2000,
    className,
    children,
    ...rest
  } = props;
  const [isCopied, setIsCopied] = useState(false);
  const { raw } = useStackTrace();

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    try {
      await navigator.clipboard.writeText(raw);
      setIsCopied(true);
      onCopy?.();
      setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  const Icon = isCopied ? CheckIcon : CopyIcon;
  const accessibleLabel =
    rest["aria-label"] ??
    (isCopied ? "Copied stack trace" : "Copy stack trace");

  return (
    <Button
      aria-label={accessibleLabel}
      className={cn("size-7", className)}
      onClick={() => void copyToClipboard()}
      size="icon"
      variant="ghost"
      {...rest}
    >
      {children ?? <Icon aria-hidden="true" size={14} />}
    </Button>
  );
});

/** Props for the StackTraceExpandButton component. */
export type StackTraceExpandButtonProps = ComponentProps<"div">;

/**
 * Renders an expand/collapse icon for the stack trace.
 *
 * @param props - Div props for the expand icon container.
 * @returns An expand icon element.
 */
export const StackTraceExpandButton = memo(
  (props: StackTraceExpandButtonProps) => {
    const { className, ...rest } = props;
    const { isOpen } = useStackTrace();

    return (
      <div
        className={cn("flex size-7 items-center justify-center", className)}
        {...rest}
      >
        <ChevronDownIcon
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            isOpen ? "rotate-180" : "rotate-0",
          )}
        />
      </div>
    );
  },
);

/** Props for the StackTraceContent component. */
export type StackTraceContentProps = ComponentProps<
  typeof CollapsibleContent
> & {
  maxHeight?: number;
};

/**
 * Renders the collapsible content area for stack frames.
 *
 * @param props - Collapsible content props and optional max height.
 * @returns A collapsible content element.
 */
export const StackTraceContent = memo((props: StackTraceContentProps) => {
  const { className, maxHeight = 400, children, ...rest } = props;
  return (
    <CollapsibleContent
      className={cn(
        "overflow-auto border-t bg-muted/30",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=open]:animate-in",
        className,
      )}
      style={{ maxHeight }}
      {...rest}
    >
      {children}
    </CollapsibleContent>
  );
});

/** Props for the StackTraceFrames component. */
export type StackTraceFramesProps = ComponentProps<"div"> & {
  frameScope?: "all" | "public";
};

/**
 * Renders the parsed stack frames.
 *
 * @param props - Div props including frame scope.
 * @returns A list of stack frames.
 */
export const StackTraceFrames = memo((props: StackTraceFramesProps) => {
  const { className, frameScope = "all", ...rest } = props;
  const { trace, onFilePathClick } = useStackTrace();

  const framesToShow =
    frameScope === "all"
      ? trace.frames
      : trace.frames.filter((f) => !f.isInternal);

  return (
    <div className={cn("space-y-1 p-3", className)} {...rest}>
      {framesToShow.map((frame, index) => (
        <div
          className={cn(
            "text-xs",
            frame.isInternal
              ? "text-muted-foreground/50"
              : "text-foreground/90",
          )}
          key={`${frame.raw}-${index}`}
        >
          <span className="text-muted-foreground">at </span>
          {frame.functionName ? (
            <span className={frame.isInternal ? "" : "text-foreground"}>
              {frame.functionName}{" "}
            </span>
          ) : null}
          {frame.filePath ? (
            <>
              <span className="text-muted-foreground">(</span>
              <button
                className={cn(
                  "underline decoration-dotted hover:text-primary",
                  onFilePathClick ? "cursor-pointer" : null,
                )}
                disabled={!onFilePathClick}
                onClick={() => {
                  if (frame.filePath) {
                    void onFilePathClick?.(
                      frame.filePath,
                      frame.lineNumber ?? undefined,
                      frame.columnNumber ?? undefined,
                    );
                  }
                }}
                type="button"
              >
                {frame.filePath}
                {frame.lineNumber !== null ? `:${frame.lineNumber}` : null}
                {frame.columnNumber !== null ? `:${frame.columnNumber}` : null}
              </button>
              <span className="text-muted-foreground">)</span>
            </>
          ) : null}
          {!(frame.filePath || frame.functionName) ? (
            <span>{frame.raw.replace(AT_PREFIX_REGEX, "")}</span>
          ) : null}
        </div>
      ))}
      {framesToShow.length === 0 ? (
        <div className="text-muted-foreground text-xs">No stack frames</div>
      ) : null}
    </div>
  );
});

StackTrace.displayName = "StackTrace";
StackTraceHeader.displayName = "StackTraceHeader";
StackTraceError.displayName = "StackTraceError";
StackTraceErrorType.displayName = "StackTraceErrorType";
StackTraceErrorMessage.displayName = "StackTraceErrorMessage";
StackTraceActions.displayName = "StackTraceActions";
StackTraceCopyButton.displayName = "StackTraceCopyButton";
StackTraceExpandButton.displayName = "StackTraceExpandButton";
StackTraceContent.displayName = "StackTraceContent";
StackTraceFrames.displayName = "StackTraceFrames";
