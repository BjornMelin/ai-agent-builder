"use client";

import type { LanguageModelUsage } from "ai";
import { type ComponentProps, createContext, useContext } from "react";
import { getUsage } from "tokenlens";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const PERCENT_MAX = 100;
const ICON_RADIUS = 10;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 2;

type ModelId = string;

interface ContextSchema {
  usedTokens: number;
  maxTokens: number;
  usage?: LanguageModelUsage;
  modelId?: ModelId;
}

const ContextContext = createContext<ContextSchema | null>(null);

const clampUsagePercent = (usedTokens: number, maxTokens: number) => {
  if (maxTokens <= 0) {
    return 0;
  }
  const raw = usedTokens / maxTokens;
  return Math.min(Math.max(raw, 0), 1);
};

const useContextValue = () => {
  const context = useContext(ContextContext);

  if (!context) {
    throw new Error("Context components must be used within Context");
  }

  return context;
};

/** Props for the Context provider. */
export type ContextProps = ComponentProps<typeof HoverCard> & ContextSchema;

/**
 * Provides model context usage to context-aware UI elements.
 *
 * @param props - Provider props including usage and optional model id.
 * @returns A provider wrapping the hover card.
 */
export const Context = (props: ContextProps) => {
  const { usedTokens, maxTokens, usage, modelId, ...rest } = props;

  return (
    <ContextContext.Provider
      value={{
        maxTokens,
        usedTokens,
        ...(usage === undefined ? {} : { usage }),
        ...(modelId === undefined ? {} : { modelId }),
      }}
    >
      <HoverCard closeDelay={0} openDelay={0} {...rest} />
    </ContextContext.Provider>
  );
};

const ContextIcon = () => {
  const { usedTokens, maxTokens } = useContextValue();
  const circumference = 2 * Math.PI * ICON_RADIUS;
  const usedPercent = clampUsagePercent(usedTokens, maxTokens);
  const dashOffset = circumference * (1 - usedPercent);

  return (
    <svg
      aria-hidden="true"
      height="20"
      style={{ color: "currentcolor" }}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      width="20"
    >
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.25"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <g
        style={{
          transform: "rotate(-90deg)",
          transformBox: "fill-box",
          transformOrigin: "center",
        }}
      >
        <circle
          cx={ICON_CENTER}
          cy={ICON_CENTER}
          fill="none"
          opacity="0.7"
          r={ICON_RADIUS}
          stroke="currentColor"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth={ICON_STROKE_WIDTH}
        />
      </g>
    </svg>
  );
};

/** Props for the ContextTrigger component. */
export type ContextTriggerProps = ComponentProps<typeof Button>;

/**
 * Renders a trigger button with percent usage and ring icon.
 *
 * @param props - Button props and optional custom children.
 * @returns A hover card trigger element.
 */
export const ContextTrigger = (props: ContextTriggerProps) => {
  const { children, "aria-label": ariaLabel, ...rest } = props;
  const { usedTokens, maxTokens } = useContextValue();
  const usedPercent = clampUsagePercent(usedTokens, maxTokens);
  const renderedPercent = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(usedPercent);
  const accessibleLabel =
    ariaLabel ?? `Model context usage: ${renderedPercent}`;

  return (
    <HoverCardTrigger asChild>
      {children ?? (
        <Button
          type="button"
          variant="ghost"
          {...rest}
          aria-label={accessibleLabel}
        >
          <span className="font-medium text-muted-foreground">
            {renderedPercent}
          </span>
          <ContextIcon />
        </Button>
      )}
    </HoverCardTrigger>
  );
};

/** Props for the ContextContent component. */
export type ContextContentProps = ComponentProps<typeof HoverCardContent>;

/**
 * Renders the hover card content container for context usage.
 *
 * @param props - Hover card content props.
 * @returns A hover card content element.
 */
export const ContextContent = (props: ContextContentProps) => {
  const { className, ...rest } = props;
  return (
    <HoverCardContent
      className={cn("min-w-60 divide-y overflow-hidden p-0", className)}
      {...rest}
    />
  );
};

/** Props for the ContextContentHeader component. */
export type ContextContentHeaderProps = ComponentProps<"div">;

/**
 * Renders the header row with percent and progress bar.
 *
 * @param props - Div props and optional custom children.
 * @returns A header element showing usage metrics.
 */
export const ContextContentHeader = (props: ContextContentHeaderProps) => {
  const { children, className, ...rest } = props;
  const { usedTokens, maxTokens } = useContextValue();
  const usedPercent = clampUsagePercent(usedTokens, maxTokens);
  const displayPct = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(usedPercent);
  const used = new Intl.NumberFormat("en-US", {
    notation: "compact",
  }).format(usedTokens);
  const total = new Intl.NumberFormat("en-US", {
    notation: "compact",
  }).format(maxTokens);

  return (
    <div className={cn("w-full space-y-2 p-3", className)} {...rest}>
      {children ?? (
        <>
          <div className="flex items-center justify-between gap-3 text-xs">
            <p>{displayPct}</p>
            <p className="font-mono text-muted-foreground">
              {used} / {total}
            </p>
          </div>
          <div className="space-y-2">
            <Progress className="bg-muted" value={usedPercent * PERCENT_MAX} />
          </div>
        </>
      )}
    </div>
  );
};

/** Props for the ContextContentBody component. */
export type ContextContentBodyProps = ComponentProps<"div">;

/**
 * Renders the main body of the context hover card.
 *
 * @param props - Div props and optional children.
 * @returns A content body element.
 */
export const ContextContentBody = (props: ContextContentBodyProps) => {
  const { children, className, ...rest } = props;
  return (
    <div className={cn("w-full p-3", className)} {...rest}>
      {children}
    </div>
  );
};

/** Props for the ContextContentFooter component. */
export type ContextContentFooterProps = ComponentProps<"div">;

/**
 * Renders the total cost row for usage, when available.
 *
 * @param props - Div props and optional custom content.
 * @returns A footer element or null when cost is unavailable.
 */
export const ContextContentFooter = (props: ContextContentFooterProps) => {
  const { children, className, ...rest } = props;
  const { modelId, usage } = useContextValue();
  const costUSD =
    modelId && usage
      ? getUsage({
          modelId,
          usage: {
            input: usage.inputTokens ?? 0,
            output: usage.outputTokens ?? 0,
          },
        }).costUSD?.totalUSD
      : undefined;
  const totalCost =
    costUSD === undefined
      ? undefined
      : new Intl.NumberFormat("en-US", {
          currency: "USD",
          style: "currency",
        }).format(costUSD);

  if (!children && totalCost === undefined) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-3 bg-secondary p-3 text-xs",
        className,
      )}
      {...rest}
    >
      {children ?? (
        <>
          <span className="text-muted-foreground">Total cost</span>
          <span>{totalCost}</span>
        </>
      )}
    </div>
  );
};

/** Props for the ContextInputUsage component. */
export type ContextInputUsageProps = ComponentProps<"div">;

/**
 * Renders the input-token usage row, including optional cost.
 *
 * @param props - Div props and optional custom content.
 * @returns The input usage row or null when no input tokens exist.
 */
export const ContextInputUsage = (props: ContextInputUsageProps) => {
  const { className, children, ...rest } = props;
  const { usage, modelId } = useContextValue();
  const inputTokens = usage?.inputTokens ?? 0;

  if (children) {
    return children;
  }

  if (!inputTokens) {
    return null;
  }

  const inputCost = modelId
    ? getUsage({
        modelId,
        usage: { input: inputTokens, output: 0 },
      }).costUSD?.totalUSD
    : undefined;
  const inputCostText =
    inputCost === undefined
      ? undefined
      : new Intl.NumberFormat("en-US", {
          currency: "USD",
          style: "currency",
        }).format(inputCost);

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...rest}
    >
      <span className="text-muted-foreground">Input</span>
      <TokensWithCost costText={inputCostText} tokens={inputTokens} />
    </div>
  );
};

/** Props for the ContextOutputUsage component. */
export type ContextOutputUsageProps = ComponentProps<"div">;

/**
 * Renders the output-token usage row, including optional cost.
 *
 * @param props - Div props and optional custom content.
 * @returns The output usage row or null when no output tokens exist.
 */
export const ContextOutputUsage = (props: ContextOutputUsageProps) => {
  const { className, children, ...rest } = props;
  const { usage, modelId } = useContextValue();
  const outputTokens = usage?.outputTokens ?? 0;

  if (children) {
    return children;
  }

  if (!outputTokens) {
    return null;
  }

  const outputCost = modelId
    ? getUsage({
        modelId,
        usage: { input: 0, output: outputTokens },
      }).costUSD?.totalUSD
    : undefined;
  const outputCostText =
    outputCost === undefined
      ? undefined
      : new Intl.NumberFormat("en-US", {
          currency: "USD",
          style: "currency",
        }).format(outputCost);

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...rest}
    >
      <span className="text-muted-foreground">Output</span>
      <TokensWithCost costText={outputCostText} tokens={outputTokens} />
    </div>
  );
};

/** Props for the ContextReasoningUsage component. */
export type ContextReasoningUsageProps = ComponentProps<"div">;

/**
 * Renders the reasoning-token usage row, including optional cost.
 *
 * @param props - Div props and optional custom content.
 * @returns The reasoning usage row or null when no reasoning tokens exist.
 */
export const ContextReasoningUsage = (props: ContextReasoningUsageProps) => {
  const { className, children, ...rest } = props;
  const { usage, modelId } = useContextValue();
  const reasoningTokens = usage?.reasoningTokens ?? 0;

  if (children) {
    return children;
  }

  if (!reasoningTokens) {
    return null;
  }

  const reasoningCost = modelId
    ? getUsage({
        modelId,
        usage: { reasoningTokens },
      }).costUSD?.totalUSD
    : undefined;
  const reasoningCostText =
    reasoningCost === undefined
      ? undefined
      : new Intl.NumberFormat("en-US", {
          currency: "USD",
          style: "currency",
        }).format(reasoningCost);

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...rest}
    >
      <span className="text-muted-foreground">Reasoning</span>
      <TokensWithCost costText={reasoningCostText} tokens={reasoningTokens} />
    </div>
  );
};

/** Props for the ContextCacheUsage component. */
export type ContextCacheUsageProps = ComponentProps<"div">;

/**
 * Renders the cache-token usage row, including optional cost.
 *
 * @param props - Div props and optional custom content.
 * @returns The cache usage row or null when no cache tokens exist.
 */
export const ContextCacheUsage = (props: ContextCacheUsageProps) => {
  const { className, children, ...rest } = props;
  const { usage, modelId } = useContextValue();
  const cacheTokens = usage?.cachedInputTokens ?? 0;

  if (children) {
    return children;
  }

  if (!cacheTokens) {
    return null;
  }

  const cacheCost = modelId
    ? getUsage({
        modelId,
        usage: { cacheReads: cacheTokens, input: 0, output: 0 },
      }).costUSD?.totalUSD
    : undefined;
  const cacheCostText =
    cacheCost === undefined
      ? undefined
      : new Intl.NumberFormat("en-US", {
          currency: "USD",
          style: "currency",
        }).format(cacheCost);

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...rest}
    >
      <span className="text-muted-foreground">Cache</span>
      <TokensWithCost costText={cacheCostText} tokens={cacheTokens} />
    </div>
  );
};

const TokensWithCost = ({
  tokens,
  costText,
}: {
  tokens?: number;
  costText: string | undefined;
}) => (
  <span>
    {tokens === undefined
      ? "—"
      : new Intl.NumberFormat("en-US", {
          notation: "compact",
        }).format(tokens)}
    {costText ? (
      <span className="ml-2 text-muted-foreground">• {costText}</span>
    ) : null}
  </span>
);
