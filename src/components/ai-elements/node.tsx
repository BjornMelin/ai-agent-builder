import { Handle, Position } from "@xyflow/react";
import type { ComponentProps } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Props for the Node component. */
export type NodeProps = ComponentProps<typeof Card> & {
  handles: {
    target: boolean;
    source: boolean;
  };
};

/**
 * Renders an XYFlow node with optional source and target handles.
 *
 * @param props - Card props including handle configuration.
 * @returns A node card element with connection handles.
 */
export const Node = (props: NodeProps) => {
  const { handles, className, children, ...rest } = props;
  return (
    <Card
      className={cn(
        "node-container relative size-full h-auto w-sm gap-0 rounded-md p-0",
        className,
      )}
      {...rest}
    >
      {handles.target ? (
        <Handle position={Position.Left} type="target" />
      ) : null}
      {handles.source ? (
        <Handle position={Position.Right} type="source" />
      ) : null}
      {children}
    </Card>
  );
};

/** Props for the NodeHeader component. */
export type NodeHeaderProps = ComponentProps<typeof CardHeader>;

/**
 * Renders the header area for a node card.
 *
 * @param props - Props forwarded to `CardHeader`.
 * @returns A styled node header.
 */
export const NodeHeader = (props: NodeHeaderProps) => {
  const { className, ...rest } = props;
  return (
    <CardHeader
      className={cn(
        "gap-0.5 rounded-t-md border-b bg-secondary p-3!",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the NodeTitle component. */
export type NodeTitleProps = ComponentProps<typeof CardTitle>;

/**
 * Renders the title text for a node.
 *
 * @param props - Props forwarded to `CardTitle`.
 * @returns A node title element.
 */
export const NodeTitle = (props: NodeTitleProps) => <CardTitle {...props} />;

/** Props for the NodeDescription component. */
export type NodeDescriptionProps = ComponentProps<typeof CardDescription>;

/**
 * Renders supporting text for a node.
 *
 * @param props - Props forwarded to `CardDescription`.
 * @returns A node description element.
 */
export const NodeDescription = (props: NodeDescriptionProps) => (
  <CardDescription {...props} />
);

/** Props for the NodeAction component. */
export type NodeActionProps = ComponentProps<typeof CardAction>;

/**
 * Renders an action slot in the node header.
 *
 * @param props - Props forwarded to `CardAction`.
 * @returns A node action element.
 */
export const NodeAction = (props: NodeActionProps) => <CardAction {...props} />;

/** Props for the NodeContent component. */
export type NodeContentProps = ComponentProps<typeof CardContent>;

/**
 * Renders the main content section of a node.
 *
 * @param props - Props forwarded to `CardContent`.
 * @returns A styled node content section.
 */
export const NodeContent = (props: NodeContentProps) => {
  const { className, ...rest } = props;
  return <CardContent className={cn("p-3", className)} {...rest} />;
};

/** Props for the NodeFooter component. */
export type NodeFooterProps = ComponentProps<typeof CardFooter>;

/**
 * Renders the footer area for a node card.
 *
 * @param props - Props forwarded to `CardFooter`.
 * @returns A styled node footer.
 */
export const NodeFooter = (props: NodeFooterProps) => {
  const { className, ...rest } = props;
  return (
    <CardFooter
      className={cn("rounded-b-md border-t bg-secondary p-3!", className)}
      {...rest}
    />
  );
};
