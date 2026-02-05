"use client";

import { type LucideIcon, XIcon } from "lucide-react";
import type { ComponentProps, HTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Props for the Artifact component.
 */
export type ArtifactProps = HTMLAttributes<HTMLDivElement>;
/**
 * Root container for an artifact.
 *
 * @param props - Component properties.
 * @returns The rendered artifact container.
 */
export const Artifact = (props: ArtifactProps) => {
  const { className, ...rest } = props;
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-background shadow-sm",
        className,
      )}
      {...rest}
    />
  );
};

/**
 * Props for the ArtifactHeader component.
 */
export type ArtifactHeaderProps = HTMLAttributes<HTMLDivElement>;
/**
 * Header section of an artifact.
 *
 * @param props - Component properties.
 * @returns The rendered artifact header.
 */
export const ArtifactHeader = (props: ArtifactHeaderProps) => {
  const { className, ...rest } = props;
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b bg-muted/50 px-4 py-3",
        className,
      )}
      {...rest}
    />
  );
};

/**
 * Props for the ArtifactClose component.
 */
export type ArtifactCloseProps = ComponentProps<typeof Button>;
/**
 * A button to close the artifact.
 *
 * @param props - Component properties.
 * @returns The rendered close button.
 */
export const ArtifactClose = (props: ArtifactCloseProps) => {
  const {
    className,
    children,
    size = "sm",
    variant = "ghost",
    "aria-label": ariaLabel,
    ...rest
  } = props;
  const accessibleLabel = ariaLabel ?? "Close";
  return (
    <Button
      aria-label={accessibleLabel}
      className={cn(
        "size-8 p-0 text-muted-foreground hover:text-foreground",
        className,
      )}
      size={size}
      type="button"
      variant={variant}
      {...rest}
    >
      {children ?? <XIcon aria-hidden="true" className="size-4" />}
    </Button>
  );
};

/**
 * Props for the ArtifactTitle component.
 */
export type ArtifactTitleProps = HTMLAttributes<HTMLParagraphElement>;
/**
 * Title element for an artifact.
 *
 * @param props - Component properties.
 * @returns The rendered artifact title.
 */
export const ArtifactTitle = (props: ArtifactTitleProps) => {
  const { className, ...rest } = props;
  return (
    <p
      className={cn("font-medium text-foreground text-sm", className)}
      {...rest}
    />
  );
};

/**
 * Props for the ArtifactDescription component.
 */
export type ArtifactDescriptionProps = HTMLAttributes<HTMLParagraphElement>;
/**
 * Description text for an artifact.
 *
 * @param props - Component properties.
 * @returns The rendered artifact description.
 */
export const ArtifactDescription = (props: ArtifactDescriptionProps) => {
  const { className, ...rest } = props;
  return (
    <p className={cn("text-muted-foreground text-sm", className)} {...rest} />
  );
};

/**
 * Props for the ArtifactActions component.
 */
export type ArtifactActionsProps = HTMLAttributes<HTMLDivElement>;
/**
 * Container for artifact-related actions.
 *
 * @param props - Component properties.
 * @returns The rendered actions container.
 */
export const ArtifactActions = (props: ArtifactActionsProps) => {
  const { className, ...rest } = props;
  return <div className={cn("flex items-center gap-1", className)} {...rest} />;
};

/**
 * Props for an individual ArtifactAction.
 */
export type ArtifactActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
  icon?: LucideIcon;
};
/**
 * An individual action button for an artifact, optionally with a tooltip.
 *
 * @param props - Component properties, including tooltip, label, and icon.
 * @returns The rendered action button, wrapped in a tooltip if provided.
 */
export const ArtifactAction = (props: ArtifactActionProps) => {
  const {
    tooltip,
    label,
    icon: Icon,
    children,
    className,
    size = "sm",
    variant = "ghost",
    ...rest
  } = props;
  const accessibleName =
    tooltip || label || rest["aria-label"] || "Artifact action";

  const button = (
    <Button
      className={cn(
        "size-8 p-0 text-muted-foreground hover:text-foreground",
        className,
      )}
      size={size}
      type="button"
      variant={variant}
      {...rest}
    >
      {Icon ? <Icon aria-hidden="true" className="size-4" /> : children}
      {accessibleName && <span className="sr-only">{accessibleName}</span>}
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

/**
 * Props for the ArtifactContent component.
 */
export type ArtifactContentProps = HTMLAttributes<HTMLDivElement>;
/**
 * Main content area of an artifact.
 *
 * @param props - Component properties.
 * @returns The rendered artifact content area.
 */
export const ArtifactContent = (props: ArtifactContentProps) => {
  const { className, ...rest } = props;
  return (
    <div className={cn("flex-1 overflow-auto p-4", className)} {...rest} />
  );
};
