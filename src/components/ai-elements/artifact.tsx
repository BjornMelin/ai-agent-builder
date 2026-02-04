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
export const Artifact = ({ className, ...props }: ArtifactProps) => (
  <div
    className={cn(
      "flex flex-col overflow-hidden rounded-lg border bg-background shadow-sm",
      className,
    )}
    {...props}
  />
);

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
export const ArtifactHeader = ({
  className,
  ...props
}: ArtifactHeaderProps) => (
  <div
    className={cn(
      "flex items-center justify-between border-b bg-muted/50 px-4 py-3",
      className,
    )}
    {...props}
  />
);

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
export const ArtifactClose = ({
  className,
  children,
  size = "sm",
  variant = "ghost",
  ...props
}: ArtifactCloseProps) => (
  <Button
    className={cn(
      "size-8 p-0 text-muted-foreground hover:text-foreground",
      className,
    )}
    size={size}
    type="button"
    variant={variant}
    {...props}
  >
    {children ?? <XIcon className="size-4" />}
    <span className="sr-only">Close</span>
  </Button>
);

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
export const ArtifactTitle = ({ className, ...props }: ArtifactTitleProps) => (
  <p
    className={cn("font-medium text-foreground text-sm", className)}
    {...props}
  />
);

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
export const ArtifactDescription = ({
  className,
  ...props
}: ArtifactDescriptionProps) => (
  <p className={cn("text-muted-foreground text-sm", className)} {...props} />
);

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
export const ArtifactActions = ({
  className,
  ...props
}: ArtifactActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props} />
);

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
export const ArtifactAction = ({
  tooltip,
  label,
  icon: Icon,
  children,
  className,
  size = "sm",
  variant = "ghost",
  ...props
}: ArtifactActionProps) => {
  const accessibleName = tooltip || label || props["aria-label"];

  const button = (
    <Button
      className={cn(
        "size-8 p-0 text-muted-foreground hover:text-foreground",
        className,
      )}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {Icon ? <Icon className="size-4" /> : children}
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
export const ArtifactContent = ({
  className,
  ...props
}: ArtifactContentProps) => (
  <div className={cn("flex-1 overflow-auto p-4", className)} {...props} />
);
