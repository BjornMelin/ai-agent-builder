"use client";

import { ChevronsUpDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Shimmer } from "./shimmer";

type PlanState = "idle" | "streaming";

interface PlanContextValue {
  state: PlanState;
}

const PlanContext = createContext<PlanContextValue | null>(null);

const usePlan = () => {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error("Plan components must be used within Plan");
  }
  return context;
};

/** Props for the Plan component. */
export type PlanProps = ComponentProps<typeof Collapsible> & {
  state?: PlanState;
};

/**
 * Renders a collapsible plan card with streaming state.
 *
 * @param props - Collapsible props including optional state.
 * @returns A plan card element.
 */
export const Plan = (props: PlanProps) => {
  const { className, state = "idle", children, ...rest } = props;
  return (
    <PlanContext.Provider value={{ state }}>
      <Collapsible asChild data-slot="plan" {...rest}>
        <Card className={cn("shadow-none", className)}>{children}</Card>
      </Collapsible>
    </PlanContext.Provider>
  );
};

/** Props for the PlanHeader component. */
export type PlanHeaderProps = ComponentProps<typeof CardHeader>;

/**
 * Renders the header area for a plan card.
 *
 * @param props - Card header props.
 * @returns A plan header element.
 */
export const PlanHeader = (props: PlanHeaderProps) => {
  const { className, ...rest } = props;
  return (
    <CardHeader
      className={cn("flex items-start justify-between", className)}
      data-slot="plan-header"
      {...rest}
    />
  );
};

/** Props for the PlanTitle component. */
export type PlanTitleProps = Omit<
  ComponentProps<typeof CardTitle>,
  "children"
> & {
  children: string;
};

/**
 * Renders the plan title and optional shimmer during streaming.
 *
 * @param props - Title props including text content.
 * @returns A plan title element.
 */
export const PlanTitle = (props: PlanTitleProps) => {
  const { children, ...rest } = props;
  const { state } = usePlan();
  const isStreaming = state === "streaming";

  return (
    <CardTitle data-slot="plan-title" {...rest}>
      {isStreaming ? <Shimmer>{children}</Shimmer> : children}
    </CardTitle>
  );
};

/** Props for the PlanDescription component. */
export type PlanDescriptionProps = Omit<
  ComponentProps<typeof CardDescription>,
  "children"
> & {
  children: string;
};

/**
 * Renders the plan description with optional shimmer during streaming.
 *
 * @param props - Description props including text content.
 * @returns A plan description element.
 */
export const PlanDescription = (props: PlanDescriptionProps) => {
  const { className, children, ...rest } = props;
  const { state } = usePlan();
  const isStreaming = state === "streaming";

  return (
    <CardDescription
      className={cn("text-balance", className)}
      data-slot="plan-description"
      {...rest}
    >
      {isStreaming ? <Shimmer>{children}</Shimmer> : children}
    </CardDescription>
  );
};

/** Props for the PlanAction component. */
export type PlanActionProps = ComponentProps<typeof CardAction>;

/**
 * Renders an action slot for the plan header.
 *
 * @param props - Card action props.
 * @returns A plan action element.
 */
export const PlanAction = (props: PlanActionProps) => (
  <CardAction data-slot="plan-action" {...props} />
);

/** Props for the PlanContent component. */
export type PlanContentProps = ComponentProps<typeof CardContent>;

/**
 * Renders the collapsible content area for the plan.
 *
 * @param props - Card content props.
 * @returns A plan content element.
 */
export const PlanContent = (props: PlanContentProps) => (
  <CollapsibleContent asChild>
    <CardContent data-slot="plan-content" {...props} />
  </CollapsibleContent>
);

/** Props for the PlanFooter component. */
export type PlanFooterProps = ComponentProps<"div">;

/**
 * Renders the footer area for the plan.
 *
 * @param props - Footer props.
 * @returns A plan footer element.
 */
export const PlanFooter = (props: PlanFooterProps) => (
  <CardFooter data-slot="plan-footer" {...props} />
);

/** Props for the PlanTrigger component. */
export type PlanTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

/**
 * Renders the trigger button for expanding or collapsing the plan.
 *
 * @param props - Collapsible trigger props.
 * @returns A trigger button element.
 */
export const PlanTrigger = (props: PlanTriggerProps) => {
  const { className, ...rest } = props;
  return (
    <CollapsibleTrigger asChild>
      <Button
        className={cn("size-8", className)}
        data-slot="plan-trigger"
        size="icon"
        variant="ghost"
        {...rest}
      >
        <ChevronsUpDownIcon className="size-4" />
        <span className="sr-only">Toggle plan</span>
      </Button>
    </CollapsibleTrigger>
  );
};
