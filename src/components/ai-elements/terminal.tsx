"use client";

import Ansi from "ansi-to-react";
import { CheckIcon, CopyIcon, TerminalIcon, Trash2Icon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Shimmer } from "./shimmer";

interface TerminalContextType {
  output: string;
  mode: "streaming" | "static";
  scroll: "auto" | "manual";
  onClear?: () => void;
}

const TerminalContext = createContext<TerminalContextType>({
  mode: "static",
  output: "",
  scroll: "auto",
});

/** Props for the `Terminal` component. */
export type TerminalProps = HTMLAttributes<HTMLDivElement> & {
  output: string;
  mode?: "streaming" | "static";
  scroll?: "auto" | "manual";
  onClear?: () => void;
};

/**
 * Renders the terminal root container and provides terminal state context.
 *
 * @param props - Terminal output and container props.
 * @returns The terminal root element.
 */
export const Terminal = (props: TerminalProps) => {
  const {
    output,
    mode = "static",
    scroll = "auto",
    onClear,
    className,
    children,
    ...rest
  } = props;
  return (
    <TerminalContext.Provider
      value={{
        mode,
        output,
        scroll,
        ...(onClear === undefined ? {} : { onClear }),
      }}
    >
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-lg border bg-zinc-950 text-zinc-100",
          className,
        )}
        {...rest}
      >
        {children ?? (
          <>
            <TerminalHeader>
              <TerminalTitle />
              <div className="flex items-center gap-1">
                <TerminalStatus />
                <TerminalActions>
                  <TerminalCopyButton />
                  {onClear ? <TerminalClearButton /> : null}
                </TerminalActions>
              </div>
            </TerminalHeader>
            <TerminalContent />
          </>
        )}
      </div>
    </TerminalContext.Provider>
  );
};

/** Props for the `TerminalHeader` component. */
export type TerminalHeaderProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the terminal header row.
 *
 * @param props - Header container props.
 * @returns The terminal header.
 */
export const TerminalHeader = (props: TerminalHeaderProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn(
        "flex items-center justify-between border-zinc-800 border-b px-4 py-2",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

/** Props for the `TerminalTitle` component. */
export type TerminalTitleProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the terminal title area with icon.
 *
 * @param props - Title container props.
 * @returns The terminal title row.
 */
export const TerminalTitle = (props: TerminalTitleProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn("flex items-center gap-2 text-sm text-zinc-400", className)}
      {...rest}
    >
      <TerminalIcon className="size-4" />
      {children ?? "Terminal"}
    </div>
  );
};

/** Props for the `TerminalStatus` component. */
export type TerminalStatusProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the terminal status indicator while output is streaming.
 *
 * @param props - Status content props.
 * @returns Streaming status UI or `null`.
 */
export const TerminalStatus = (props: TerminalStatusProps) => {
  const { className, children, ...rest } = props;
  const { mode } = useContext(TerminalContext);

  if (mode !== "streaming") {
    return null;
  }

  return (
    <div
      className={cn("flex items-center gap-2 text-xs text-zinc-400", className)}
      {...rest}
    >
      {children ?? (
        <Shimmer as="span" className="w-16">
          Running
        </Shimmer>
      )}
    </div>
  );
};

/** Props for the `TerminalActions` component. */
export type TerminalActionsProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the action button group in the terminal header.
 *
 * @param props - Action container props.
 * @returns The terminal actions row.
 */
export const TerminalActions = (props: TerminalActionsProps) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("flex items-center gap-1", className)} {...rest}>
      {children}
    </div>
  );
};

/** Props for the `TerminalCopyButton` component. */
export type TerminalCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  timeout?: number;
};

/**
 * Renders a button that copies terminal output to the clipboard.
 *
 * @param props - Copy button and callback props.
 * @returns A terminal copy button.
 */
export const TerminalCopyButton = (props: TerminalCopyButtonProps) => {
  const {
    onCopy,
    onError,
    timeout = 2000,
    children,
    className,
    ...rest
  } = props;
  const [isCopied, setIsCopied] = useState(false);
  const { output } = useContext(TerminalContext);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      await onError?.(new Error("Clipboard API not available"));
      return;
    }

    try {
      await navigator.clipboard.writeText(output);
      setIsCopied(true);
      await onCopy?.();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      await onError?.(error as Error);
    }
  };

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      aria-label={isCopied ? "Copied terminal output" : "Copy terminal output"}
      className={cn(
        "size-7 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
        className,
      )}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...rest}
    >
      {children ?? <Icon aria-hidden="true" size={14} />}
    </Button>
  );
};

/** Props for the `TerminalClearButton` component. */
export type TerminalClearButtonProps = ComponentProps<typeof Button>;

/**
 * Renders a button that clears terminal output.
 *
 * @param props - Clear button props.
 * @returns A clear button or `null`.
 */
export const TerminalClearButton = (props: TerminalClearButtonProps) => {
  const { children, className, ...rest } = props;
  const { onClear } = useContext(TerminalContext);

  if (!onClear) {
    return null;
  }

  return (
    <Button
      aria-label="Clear terminal output"
      className={cn(
        "size-7 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
        className,
      )}
      onClick={onClear}
      size="icon"
      variant="ghost"
      {...rest}
    >
      {children ?? <Trash2Icon aria-hidden="true" size={14} />}
    </Button>
  );
};

/** Props for the `TerminalContent` component. */
export type TerminalContentProps = HTMLAttributes<HTMLDivElement> & {
  announceStreaming?: boolean;
};

/**
 * Renders terminal output content and optional auto-scroll behavior.
 *
 * @param props - Content container props.
 * @returns Terminal output content.
 */
export const TerminalContent = (props: TerminalContentProps) => {
  const { className, children, announceStreaming = true, ...rest } = props;
  const { output, mode, scroll } = useContext(TerminalContext);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasStreamed, setHasStreamed] = useState(false);
  const statusMessage =
    mode === "streaming"
      ? "Terminal output is streaming."
      : hasStreamed
        ? "Terminal output stream finished."
        : null;

  useEffect(() => {
    if (mode === "streaming" && !hasStreamed) {
      const timer = window.setTimeout(() => {
        setHasStreamed(true);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [hasStreamed, mode]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: output triggers auto-scroll when new content arrives
  useEffect(() => {
    if (scroll === "auto" && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [output, scroll]);

  return (
    <div
      className={cn(
        "max-h-96 overflow-auto p-4 font-mono text-sm leading-relaxed",
        className,
      )}
      ref={containerRef}
      {...rest}
    >
      {announceStreaming && statusMessage ? (
        <output aria-live="polite" className="sr-only">
          {statusMessage}
        </output>
      ) : null}
      {children ?? (
        <pre className="whitespace-pre-wrap break-words">
          <Ansi>{output}</Ansi>
          {mode === "streaming" ? (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-zinc-100 motion-reduce:animate-none"
            />
          ) : null}
        </pre>
      )}
    </div>
  );
};
