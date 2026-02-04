"use client";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const toCodeString = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const ToolCodeBlock = ({ code }: { code: string }) => (
  <pre className="overflow-x-auto whitespace-pre-wrap rounded-md p-3 font-mono text-xs">
    <code>{code}</code>
  </pre>
);

/** Props for the Tool component. */
export type ToolProps = ComponentProps<typeof Collapsible>;

/**
 * Renders a collapsible tool container.
 *
 * @param props - Collapsible props for the tool container.
 * @returns A collapsible wrapper element.
 */
export const Tool = (props: ToolProps) => {
  const { className, ...rest } = props;
  return (
    <Collapsible
      className={cn("group not-prose mb-4 w-full rounded-md border", className)}
      {...rest}
    />
  );
};

/** Union of static and dynamic tool UI parts. */
export type ToolPart = ToolUIPart | DynamicToolUIPart;

/** Props for the ToolHeader component. */
export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

/**
 * Returns a status badge for a tool state.
 *
 * @param status - The tool state to render.
 * @returns A badge element describing the tool status.
 */
export const getStatusBadge = (status: ToolPart["state"]) => {
  const labels: Record<ToolPart["state"], string> = {
    "approval-requested": "Awaiting Approval",
    "approval-responded": "Responded",
    "input-available": "Running",
    "input-streaming": "Pending",
    "output-available": "Completed",
    "output-denied": "Denied",
    "output-error": "Error",
  };

  const icons: Record<ToolPart["state"], ReactNode> = {
    "approval-requested": <ClockIcon className="size-4 text-yellow-600" />,
    "approval-responded": <CheckCircleIcon className="size-4 text-blue-600" />,
    "input-available": <ClockIcon className="size-4 animate-pulse" />,
    "input-streaming": <CircleIcon className="size-4" />,
    "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
    "output-denied": <XCircleIcon className="size-4 text-orange-600" />,
    "output-error": <XCircleIcon className="size-4 text-red-600" />,
  };

  return (
    <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
      {icons[status]}
      {labels[status]}
    </Badge>
  );
};

/**
 * Renders the tool header with title and status badge.
 *
 * @param props - Header props including type, state, and optional title.
 * @returns A collapsible trigger header.
 */
export const ToolHeader = (props: ToolHeaderProps) => {
  const { className, title, type, state, toolName, ...rest } = props;
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-4 p-3",
        className,
      )}
      {...rest}
    >
      <div className="flex items-center gap-2">
        <WrenchIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{title ?? derivedName}</span>
        {getStatusBadge(state)}
      </div>
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

/** Props for the ToolContent component. */
export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

/**
 * Renders the collapsible content area for a tool.
 *
 * @param props - Collapsible content props.
 * @returns The tool content container.
 */
export const ToolContent = (props: ToolContentProps) => {
  const { className, ...rest } = props;
  return (
    <CollapsibleContent
      className={cn(
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-4 p-4 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the ToolInput component. */
export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

/**
 * Renders tool input parameters.
 *
 * @param props - Div props including the tool input payload.
 * @returns A formatted parameters section.
 */
export const ToolInput = (props: ToolInputProps) => {
  const { className, input, ...rest } = props;
  return (
    <div className={cn("space-y-2 overflow-hidden", className)} {...rest}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Parameters
      </h4>
      <div className="rounded-md bg-muted/50">
        <ToolCodeBlock code={toCodeString(input)} />
      </div>
    </div>
  );
};

/** Props for the ToolOutput component. */
export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

/**
 * Renders tool output results and error information.
 *
 * @param props - Div props including output and error text.
 * @returns A formatted output section or null when empty.
 */
export const ToolOutput = (props: ToolOutputProps) => {
  const { className, output, errorText, ...rest } = props;
  if (output == null && errorText == null) {
    return null;
  }

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = <ToolCodeBlock code={toCodeString(output)} />;
  } else if (typeof output === "string") {
    Output = <ToolCodeBlock code={output} />;
  }

  return (
    <div className={cn("space-y-2", className)} {...rest}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText
            ? "bg-destructive/10 text-destructive"
            : "bg-muted/50 text-foreground",
        )}
      >
        {errorText ? <div>{errorText}</div> : null}
        {Output}
      </div>
    </div>
  );
};
