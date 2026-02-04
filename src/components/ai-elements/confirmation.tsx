"use client";

import type { ToolUIPart } from "ai";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
} from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ToolUIPartApproval =
  | {
      id: string;
      approved?: never;
      reason?: never;
    }
  | {
      id: string;
      approved: boolean;
      reason?: string;
    }
  | {
      id: string;
      approved: true;
      reason?: string;
    }
  | {
      id: string;
      approved: false;
      reason?: string;
    }
  | undefined;

interface ConfirmationContextValue {
  approval: ToolUIPartApproval;
  state: ToolUIPart["state"];
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(
  null,
);

const useConfirmation = () => {
  const context = useContext(ConfirmationContext);

  if (!context) {
    throw new Error("Confirmation components must be used within Confirmation");
  }

  return context;
};

/** Props for the Confirmation component. */
export type ConfirmationProps = ComponentProps<typeof Alert> & {
  approval?: ToolUIPartApproval;
  state: ToolUIPart["state"];
};

/**
 * Renders a confirmation wrapper for tool approvals based on state.
 *
 * @param props - Alert props including approval and state.
 * @returns The confirmation wrapper or null when not applicable.
 */
export const Confirmation = (props: ConfirmationProps) => {
  const { className, approval, state, ...rest } = props;
  if (!approval || state === "input-streaming" || state === "input-available") {
    return null;
  }

  return (
    <ConfirmationContext.Provider value={{ approval, state }}>
      <Alert className={cn("flex flex-col gap-2", className)} {...rest} />
    </ConfirmationContext.Provider>
  );
};

/** Props for the ConfirmationTitle component. */
export type ConfirmationTitleProps = ComponentProps<typeof AlertDescription>;

/**
 * Renders the title/summary text for a confirmation block.
 *
 * @param props - Alert description props.
 * @returns A confirmation title element.
 */
export const ConfirmationTitle = (props: ConfirmationTitleProps) => {
  const { className, ...rest } = props;
  return <AlertDescription className={cn("inline", className)} {...rest} />;
};

/** Props for the ConfirmationRequest component. */
export interface ConfirmationRequestProps {
  children?: ReactNode;
}

/**
 * Shows content only when approval has been requested.
 *
 * @param props - Request props including children.
 * @returns The children when request state is active; otherwise null.
 */
export const ConfirmationRequest = (props: ConfirmationRequestProps) => {
  const { children } = props;
  const { state } = useConfirmation();

  // Only show when approval is requested
  if (state !== "approval-requested") {
    return null;
  }

  return children;
};

/** Props for the ConfirmationAccepted component. */
export interface ConfirmationAcceptedProps {
  children?: ReactNode;
}

/**
 * Shows content only when approval has been accepted.
 *
 * @param props - Accepted props including children.
 * @returns The children when approval is accepted; otherwise null.
 */
export const ConfirmationAccepted = (props: ConfirmationAcceptedProps) => {
  const { children } = props;
  const { approval, state } = useConfirmation();

  // Only show when approved and in response states
  if (
    !approval?.approved ||
    (state !== "approval-responded" &&
      state !== "output-denied" &&
      state !== "output-available")
  ) {
    return null;
  }

  return children;
};

/** Props for the ConfirmationRejected component. */
export interface ConfirmationRejectedProps {
  children?: ReactNode;
}

/**
 * Shows content only when approval has been rejected.
 *
 * @param props - Rejected props including children.
 * @returns The children when approval is rejected; otherwise null.
 */
export const ConfirmationRejected = (props: ConfirmationRejectedProps) => {
  const { children } = props;
  const { approval, state } = useConfirmation();

  // Only show when rejected and in response states
  if (
    approval?.approved !== false ||
    (state !== "approval-responded" &&
      state !== "output-denied" &&
      state !== "output-available")
  ) {
    return null;
  }

  return children;
};

/** Props for the ConfirmationActions component. */
export type ConfirmationActionsProps = ComponentProps<"div">;

/**
 * Renders action buttons only when approval is requested.
 *
 * @param props - Div props for the actions container.
 * @returns A actions container or null when not applicable.
 */
export const ConfirmationActions = (props: ConfirmationActionsProps) => {
  const { className, ...rest } = props;
  const { state } = useConfirmation();

  // Only show when approval is requested
  if (state !== "approval-requested") {
    return null;
  }

  return (
    <div
      className={cn("flex items-center justify-end gap-2 self-end", className)}
      {...rest}
    />
  );
};

/** Props for the ConfirmationAction component. */
export type ConfirmationActionProps = ComponentProps<typeof Button>;

/**
 * Renders a styled confirmation action button.
 *
 * @param props - Button props for the action.
 * @returns A confirmation action button element.
 */
export const ConfirmationAction = (props: ConfirmationActionProps) => {
  return <Button className="h-8 px-3 text-sm" type="button" {...props} />;
};
