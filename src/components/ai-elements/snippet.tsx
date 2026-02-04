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
 * Props for the {@link SnippetCopyButton} component.
 *
 * @param onCopy - Callback function called when the code is successfully copied.
 * @param onError - Callback function called when an error occurs or the Clipboard API is unavailable.
 * @param timeout - Duration in milliseconds to wait before resetting the "copied" state. Defaults to 2000.
 * @param children - Optional custom content to display inside the button.
 * @param className - Optional CSS class name for the button.
 * @param props - Additional props spread to the underlying {@link InputGroupButton}.
 */
export type SnippetCopyButtonProps = ComponentProps<typeof InputGroupButton> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

/**
 * A copy-to-clipboard button component designed to work within a {@link Snippet} context.
 *
 * The component uses the `copyToClipboard` helper to check for Clipboard API availability,
 * calling `onError` if it is unavailable. On success, it writes the code from
 * {@link SnippetContext} to the clipboard, sets the `isCopied` state, calls `onCopy`, and
 * schedules a reset of the `isCopied` state after the specified `timeout` via `timeoutRef`.
 *
 * It includes a `useEffect` cleanup that clears the `timeoutRef` to prevent side effects after
 * unmounting. Visually, the component perform a swap between {@link CopyIcon} and
 * {@link CheckIcon} based on the current copy state.
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
      onClick={copyToClipboard}
      size="icon-sm"
      title="Copy"
      {...rest}
    >
      {children ?? <Icon className="size-3.5" size={14} />}
    </InputGroupButton>
  );
};
