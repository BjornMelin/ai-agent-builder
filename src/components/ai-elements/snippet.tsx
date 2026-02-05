"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

interface SnippetContextType {
  code: string;
}

const SnippetContext = createContext<SnippetContextType>({
  code: "",
});

/**
 * Props for the Snippet component.
 * Extends InputGroup props with a required `code` string.
 */
export type SnippetProps = ComponentProps<typeof InputGroup> & {
  /** The code snippet string to be shared among children. */
  code: string;
};

/**
 * A container for code snippets that provide the code via context.
 * Applies a monospace font style and wraps multiple input-group sub-components.
 *
 * @param props - Component properties, including the `code` to share and standard InputGroup layout props.
 * @returns The rendered snippet container.
 */
export const Snippet = (props: SnippetProps) => {
  const { className, code, children, ...rest } = props;
  return (
    <SnippetContext.Provider value={{ code }}>
      <InputGroup className={cn("font-mono", className)} {...rest}>
        {children}
      </InputGroup>
    </SnippetContext.Provider>
  );
};

/** Props for the `SnippetAddon` component. */
export type SnippetAddonProps = ComponentProps<typeof InputGroupAddon>;

/**
 * Renders an add-on slot for snippet input groups.
 *
 * @param props - Props forwarded to `InputGroupAddon`.
 * @returns An input-group add-on element.
 */
export const SnippetAddon = (props: SnippetAddonProps) => (
  <InputGroupAddon {...props} />
);

/** Props for the `SnippetText` component. */
export type SnippetTextProps = ComponentProps<typeof InputGroupText>;

/**
 * Renders inline text preceding snippet input content.
 *
 * @param props - Props forwarded to `InputGroupText`.
 * @returns A styled snippet text element.
 */
export const SnippetText = (props: SnippetTextProps) => {
  const { className, ...rest } = props;
  return (
    <InputGroupText
      className={cn("pl-2 font-normal text-muted-foreground", className)}
      {...rest}
    />
  );
};

/** Props for the `SnippetInput` component. */
export type SnippetInputProps = Omit<
  ComponentProps<typeof InputGroupInput>,
  "readOnly" | "value"
>;

/**
 * Renders a read-only input bound to the snippet code context.
 *
 * @param props - Props forwarded to `InputGroupInput`.
 * @returns A read-only snippet input field.
 */
export const SnippetInput = (props: SnippetInputProps) => {
  const { className, ...rest } = props;
  const { code } = useContext(SnippetContext);

  return (
    <InputGroupInput
      className={cn("text-foreground", className)}
      readOnly
      value={code}
      {...rest}
    />
  );
};

/**
 * Props for the SnippetCopyButton component.
 *
 * Extends `InputGroupButton` props with optional copy callbacks and reset timing.
 */
export type SnippetCopyButtonProps = ComponentProps<typeof InputGroupButton> & {
  /** Callback invoked after a successful copy operation. */
  onCopy?: () => void;
  /** Callback invoked when copying fails or Clipboard APIs are unavailable. */
  onError?: (error: Error) => void;
  /** Milliseconds to keep the copied state active before resetting. */
  timeout?: number;
};

/**
 * A copy-to-clipboard button component for snippet content.
 *
 * The component uses the `copyToClipboard` helper to check for Clipboard API availability,
 * calling `onError` if it is unavailable. On success, it writes the code from
 * snippet context to the clipboard, sets the `isCopied` state, calls `onCopy`, and
 * schedules a reset of the `isCopied` state after the specified `timeout` via `timeoutRef`.
 *
 * It includes a `useEffect` cleanup that clears the `timeoutRef` to prevent side effects after
 * unmounting. Visually, the component swaps between copy and check icons based on state.
 *
 * @param props - Copy callbacks, timeout, and button props.
 * @returns A button that copies the current snippet code to the clipboard.
 */
export const SnippetCopyButton = (props: SnippetCopyButtonProps) => {
  const {
    onCopy,
    onError,
    timeout = 2000,
    children,
    className,
    ...rest
  } = props;
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);
  const { code } = useContext(SnippetContext);

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    try {
      if (!isCopied) {
        await navigator.clipboard.writeText(code);
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
    <InputGroupButton
      aria-label="Copy"
      className={className}
      onClick={() => void copyToClipboard()}
      size="icon-sm"
      title="Copy"
      {...rest}
    >
      {children ?? <Icon aria-hidden="true" className="size-3.5" size={14} />}
    </InputGroupButton>
  );
};
