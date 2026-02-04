"use client";

import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface EnvironmentVariablesContextType {
  visibility: "masked" | "visible";
  setVisibility: (visibility: "masked" | "visible") => void;
}

const EnvironmentVariablesContext =
  createContext<EnvironmentVariablesContextType>({
    setVisibility: () => undefined,
    visibility: "masked",
  });

/** Props for the EnvironmentVariables component. */
export type EnvironmentVariablesProps = HTMLAttributes<HTMLDivElement> & {
  visibility?: "masked" | "visible";
  defaultVisibility?: "masked" | "visible";
  onVisibilityChange?: (visibility: "masked" | "visible") => void;
};

/**
 * Provides environment variable visibility context and layout.
 *
 * @param props - Container props including visibility controls.
 * @returns A wrapper providing visibility context.
 */
export const EnvironmentVariables = (props: EnvironmentVariablesProps) => {
  const {
    visibility: controlledVisibility,
    defaultVisibility = "masked",
    onVisibilityChange,
    className,
    children,
    ...rest
  } = props;
  const [internalVisibility, setInternalVisibility] =
    useState(defaultVisibility);
  const visibility = controlledVisibility ?? internalVisibility;

  const setVisibility = (next: "masked" | "visible") => {
    setInternalVisibility(next);
    onVisibilityChange?.(next);
  };

  return (
    <EnvironmentVariablesContext.Provider value={{ setVisibility, visibility }}>
      <div
        className={cn("rounded-lg border bg-background", className)}
        {...rest}
      >
        {children}
      </div>
    </EnvironmentVariablesContext.Provider>
  );
};

/** Props for the EnvironmentVariablesHeader component. */
export type EnvironmentVariablesHeaderProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the header row for environment variables.
 *
 * @param props - Header container props.
 * @returns A header container element.
 */
export const EnvironmentVariablesHeader = (
  props: EnvironmentVariablesHeaderProps,
) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b px-4 py-3",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

/** Props for the EnvironmentVariablesTitle component. */
export type EnvironmentVariablesTitleProps = HTMLAttributes<HTMLHeadingElement>;

/**
 * Renders the environment variables title.
 *
 * @param props - Title props including optional children.
 * @returns A title element for the section.
 */
export const EnvironmentVariablesTitle = (
  props: EnvironmentVariablesTitleProps,
) => {
  const { className, children, ...rest } = props;
  return (
    <h3 className={cn("font-medium text-sm", className)} {...rest}>
      {children ?? "Environment Variables"}
    </h3>
  );
};

/** Props for the EnvironmentVariablesToggle component. */
export type EnvironmentVariablesToggleProps = ComponentProps<typeof Switch>;

/**
 * Renders a visibility toggle for environment variables.
 *
 * @param props - Switch props for the toggle.
 * @returns A toggle control for showing or masking values.
 */
export const EnvironmentVariablesToggle = (
  props: EnvironmentVariablesToggleProps,
) => {
  const { className, ...rest } = props;
  const { visibility, setVisibility } = useContext(EnvironmentVariablesContext);
  const showValues = visibility === "visible";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-muted-foreground text-xs">
        {showValues ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
      </span>
      <Switch
        aria-label="Toggle value visibility"
        checked={showValues}
        onCheckedChange={(checked) =>
          setVisibility(checked ? "visible" : "masked")
        }
        {...rest}
      />
    </div>
  );
};

/** Props for the EnvironmentVariablesContent component. */
export type EnvironmentVariablesContentProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the content container for environment variables.
 *
 * @param props - Content container props.
 * @returns A content wrapper element.
 */
export const EnvironmentVariablesContent = (
  props: EnvironmentVariablesContentProps,
) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("divide-y", className)} {...rest}>
      {children}
    </div>
  );
};

interface EnvironmentVariableContextType {
  name: string;
  value: string;
}

const EnvironmentVariableContext =
  createContext<EnvironmentVariableContextType>({
    name: "",
    value: "",
  });

/** Props for the EnvironmentVariable component. */
export type EnvironmentVariableProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  value: string;
};

/**
 * Renders a single environment variable row.
 *
 * @param props - Row props including name and value.
 * @returns A row with name/value display and context.
 */
export const EnvironmentVariable = (props: EnvironmentVariableProps) => {
  const { name, value, className, children, ...rest } = props;
  return (
    <EnvironmentVariableContext.Provider value={{ name, value }}>
      <div
        className={cn(
          "flex items-center justify-between gap-4 px-4 py-3",
          className,
        )}
        {...rest}
      >
        {children ?? (
          <>
            <div className="flex items-center gap-2">
              <EnvironmentVariableName />
            </div>
            <EnvironmentVariableValue />
          </>
        )}
      </div>
    </EnvironmentVariableContext.Provider>
  );
};

/** Props for the EnvironmentVariableGroup component. */
export type EnvironmentVariableGroupProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders a group container for variable-related elements.
 *
 * @param props - Group container props.
 * @returns A grouped container element.
 */
export const EnvironmentVariableGroup = (
  props: EnvironmentVariableGroupProps,
) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("flex items-center gap-2", className)} {...rest}>
      {children}
    </div>
  );
};

/** Props for the EnvironmentVariableName component. */
export type EnvironmentVariableNameProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Renders the environment variable name.
 *
 * @param props - Span props and optional children.
 * @returns A name element for the variable.
 */
export const EnvironmentVariableName = (
  props: EnvironmentVariableNameProps,
) => {
  const { className, children, ...rest } = props;
  const { name } = useContext(EnvironmentVariableContext);

  return (
    <span className={cn("font-mono text-sm", className)} {...rest}>
      {children ?? name}
    </span>
  );
};

/** Props for the EnvironmentVariableValue component. */
export type EnvironmentVariableValueProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Renders the environment variable value, masked or visible.
 *
 * @param props - Span props and optional children.
 * @returns A value element for the variable.
 */
export const EnvironmentVariableValue = (
  props: EnvironmentVariableValueProps,
) => {
  const { className, children, ...rest } = props;
  const { value } = useContext(EnvironmentVariableContext);
  const { visibility } = useContext(EnvironmentVariablesContext);
  const showValues = visibility === "visible";

  const displayValue = showValues
    ? value
    : "•".repeat(Math.min(value.length, 20));

  return (
    <span
      className={cn(
        "font-mono text-muted-foreground text-sm",
        !showValues && "select-none",
        className,
      )}
      {...rest}
    >
      {children ?? displayValue}
    </span>
  );
};

/** Props for the EnvironmentVariableCopyButton component. */
export type EnvironmentVariableCopyButtonProps = ComponentProps<
  typeof Button
> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
  copyFormat?: "name" | "value" | "export";
};

/**
 * Renders a copy button for environment variable values.
 *
 * @param props - Button props including copy behavior.
 * @returns A copy button element.
 */
export const EnvironmentVariableCopyButton = (
  props: EnvironmentVariableCopyButtonProps,
) => {
  const {
    onCopy,
    onError,
    timeout = 2000,
    copyFormat = "value",
    "aria-label": ariaLabel,
    children,
    className,
    ...rest
  } = props;
  const [isCopied, setIsCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { name, value } = useContext(EnvironmentVariableContext);

  useEffect(
    () => () => {
      if (resetTimeoutRef.current !== null) {
        clearTimeout(resetTimeoutRef.current);
      }
    },
    [],
  );

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    let textToCopy = value;
    if (copyFormat === "name") {
      textToCopy = name;
    } else if (copyFormat === "export") {
      textToCopy = `export ${name}="${value}"`;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      onCopy?.();
      if (resetTimeoutRef.current !== null) {
        clearTimeout(resetTimeoutRef.current);
      }
      resetTimeoutRef.current = setTimeout(() => {
        setIsCopied(false);
      }, timeout);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  const Icon = isCopied ? CheckIcon : CopyIcon;
  const defaultAriaLabel =
    copyFormat === "name"
      ? "Copy environment variable name"
      : copyFormat === "export"
        ? "Copy environment variable export command"
        : "Copy environment variable value";

  return (
    <Button
      aria-label={ariaLabel ?? defaultAriaLabel}
      className={cn("size-6 shrink-0", className)}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...rest}
    >
      {children ?? <Icon size={12} />}
    </Button>
  );
};

/** Props for the EnvironmentVariableRequired component. */
export type EnvironmentVariableRequiredProps = ComponentProps<typeof Badge>;

/**
 * Renders a "Required" badge for environment variables.
 *
 * @param props - Badge props and optional children.
 * @returns A badge element indicating requirement.
 */
export const EnvironmentVariableRequired = (
  props: EnvironmentVariableRequiredProps,
) => {
  const { className, children, ...rest } = props;
  return (
    <Badge className={cn("text-xs", className)} variant="secondary" {...rest}>
      {children ?? "Required"}
    </Badge>
  );
};
