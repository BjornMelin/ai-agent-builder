"use client";

import type { FileUIPart, SourceDocumentUIPart } from "ai";
import {
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  Music2Icon,
  PaperclipIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import Image from "next/image";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

/** Canonical attachment payload used by attachment components. */
export type AttachmentData =
  | (FileUIPart & { id: string })
  | (SourceDocumentUIPart & { id: string });

/** Media rendering categories derived from attachment metadata. */
export type AttachmentMediaCategory =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "source"
  | "unknown";

/** Layout variants for rendering attachment collections. */
export type AttachmentVariant = "grid" | "inline" | "list";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Resolves an attachment into a media category used for rendering.
 *
 * @param data - Attachment data to inspect.
 * @returns The derived media category.
 */
export const getMediaCategory = (
  data: AttachmentData,
): AttachmentMediaCategory => {
  if (data.type === "source-document") {
    return "source";
  }

  const mediaType = data.mediaType ?? "";

  if (mediaType.startsWith("image/")) {
    return "image";
  }
  if (mediaType.startsWith("video/")) {
    return "video";
  }
  if (mediaType.startsWith("audio/")) {
    return "audio";
  }
  if (mediaType.startsWith("application/") || mediaType.startsWith("text/")) {
    return "document";
  }

  return "unknown";
};

/**
 * Builds the display label for an attachment item.
 *
 * @param data - Attachment data to label.
 * @returns The human-readable attachment label.
 */
export const getAttachmentLabel = (data: AttachmentData): string => {
  if (data.type === "source-document") {
    return data.title || data.filename || "Source";
  }

  const category = getMediaCategory(data);
  return data.filename || (category === "image" ? "Image" : "Attachment");
};

// ============================================================================
// Contexts
// ============================================================================

interface AttachmentsContextValue {
  variant: AttachmentVariant;
}

const AttachmentsContext = createContext<AttachmentsContextValue | null>(null);

interface AttachmentContextValue {
  data: AttachmentData;
  mediaCategory: AttachmentMediaCategory;
  onRemove?: () => void;
  variant: AttachmentVariant;
}

const AttachmentContext = createContext<AttachmentContextValue | null>(null);

// ============================================================================
// Hooks
// ============================================================================

/**
 * Returns attachments-level rendering options from context.
 *
 * @returns The attachments context value.
 */
export const useAttachmentsContext = () =>
  useContext(AttachmentsContext) ?? { variant: "grid" as const };

/**
 * Returns the current attachment context and validates provider usage.
 *
 * @returns The current attachment context value.
 */
export const useAttachmentContext = () => {
  const ctx = useContext(AttachmentContext);
  if (!ctx) {
    throw new Error("Attachment components must be used within <Attachment>");
  }
  return ctx;
};

// ============================================================================
// Attachments - Container
// ============================================================================

/** Props for the attachments container component. */
export type AttachmentsProps = HTMLAttributes<HTMLDivElement> & {
  variant?: AttachmentVariant;
};

/**
 * Renders the attachments container and provides layout variant context.
 *
 * @param props - Container props including display variant.
 * @returns The attachments container.
 */
export const Attachments = (props: AttachmentsProps) => {
  const { variant = "grid", className, children, ...rest } = props;
  const contextValue: AttachmentsContextValue = { variant };

  return (
    <AttachmentsContext.Provider value={contextValue}>
      <div
        className={cn(
          "flex items-start",
          variant === "list" ? "flex-col gap-2" : "flex-wrap gap-2",
          variant === "grid" && "ml-auto w-fit",
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    </AttachmentsContext.Provider>
  );
};

// ============================================================================
// Attachment - Item
// ============================================================================

/** Props for a single attachment item container. */
export type AttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: AttachmentData;
  onRemove?: () => void;
};

/**
 * Renders an individual attachment item and provides item context.
 *
 * @param props - Attachment item props.
 * @returns The attachment item container.
 */
export const Attachment = (props: AttachmentProps) => {
  const { data, onRemove, className, children, ...rest } = props;
  const { variant } = useAttachmentsContext();
  const mediaCategory = getMediaCategory(data);

  const contextValue: AttachmentContextValue = {
    data,
    mediaCategory,
    variant,
    ...(onRemove === undefined ? {} : { onRemove }),
  };

  return (
    <AttachmentContext.Provider value={contextValue}>
      <div
        className={cn(
          "group relative",
          variant === "grid" && "size-24 overflow-hidden rounded-lg",
          variant === "inline" && [
            "flex h-8 cursor-pointer select-none items-center gap-1.5",
            "rounded-md border border-border px-1.5",
            "font-medium text-sm transition-colors",
            "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
          ],
          variant === "list" && [
            "flex w-full items-center gap-3 rounded-lg border p-3",
            "hover:bg-accent/50",
          ],
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    </AttachmentContext.Provider>
  );
};

// ============================================================================
// AttachmentPreview - Media preview
// ============================================================================

/** Props for attachment preview rendering. */
export type AttachmentPreviewProps = HTMLAttributes<HTMLDivElement> & {
  fallbackIcon?: ReactNode;
};

/**
 * Renders attachment media preview content based on media type and variant.
 *
 * @param props - Preview props including optional fallback icon.
 * @returns The attachment preview element.
 */
export const AttachmentPreview = (props: AttachmentPreviewProps) => {
  const { fallbackIcon, className, ...rest } = props;
  const { data, mediaCategory, variant } = useAttachmentContext();

  const iconSize = variant === "inline" ? "size-3" : "size-4";

  const renderImage = (
    url: string,
    filename: string | undefined,
    isGrid: boolean,
  ) => {
    const isBlob = url.startsWith("blob:") || url.startsWith("data:");
    const size = isGrid ? 96 : variant === "list" ? 48 : 20;

    return (
      <Image
        alt={filename || "Image"}
        className={
          isGrid ? "size-full object-cover" : "size-full rounded object-cover"
        }
        height={size}
        sizes={`${size}px`}
        src={url}
        unoptimized={isBlob}
        width={size}
      />
    );
  };

  const renderIcon = (Icon: typeof ImageIcon) => (
    <Icon className={cn(iconSize, "text-muted-foreground")} />
  );

  const renderContent = () => {
    if (mediaCategory === "image" && data.type === "file" && data.url) {
      return renderImage(data.url, data.filename, variant === "grid");
    }

    if (mediaCategory === "video" && data.type === "file" && data.url) {
      return <video className="size-full object-cover" muted src={data.url} />;
    }

    const iconMap: Record<AttachmentMediaCategory, typeof ImageIcon> = {
      audio: Music2Icon,
      document: FileTextIcon,
      image: ImageIcon,
      source: GlobeIcon,
      unknown: PaperclipIcon,
      video: VideoIcon,
    };

    const Icon = iconMap[mediaCategory];
    return fallbackIcon ?? renderIcon(Icon);
  };

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden",
        variant === "grid" && "size-full bg-muted",
        variant === "inline" && "size-5 rounded bg-background",
        variant === "list" && "size-12 rounded bg-muted",
        className,
      )}
      {...rest}
    >
      {renderContent()}
    </div>
  );
};

// ============================================================================
// AttachmentInfo - Name and type display
// ============================================================================

/** Props for the `AttachmentInfoProps` type. */
export type AttachmentInfoProps = HTMLAttributes<HTMLDivElement> & {
  metaVisibility?: "hidden" | "shown";
};

/**
 * Renders attachment label and optional media type metadata.
 *
 * @param props - Info props including metadata visibility.
 * @returns Attachment info text or `null` for grid variant.
 */
export const AttachmentInfo = (props: AttachmentInfoProps) => {
  const { metaVisibility = "hidden", className, ...rest } = props;
  const { data, variant } = useAttachmentContext();
  const label = getAttachmentLabel(data);
  const showMediaType = metaVisibility === "shown";

  if (variant === "grid") {
    return null;
  }

  return (
    <div className={cn("min-w-0 flex-1", className)} {...rest}>
      <span className="block truncate">{label}</span>
      {showMediaType && data.mediaType ? (
        <span className="block truncate text-muted-foreground text-xs">
          {data.mediaType}
        </span>
      ) : null}
    </div>
  );
};

// ============================================================================
// AttachmentRemove - Remove button
// ============================================================================

/** Props for the `AttachmentRemoveProps` type. */
export type AttachmentRemoveProps = ComponentProps<typeof Button> & {
  label?: string;
};

/**
 * Renders an attachment remove button when `onRemove` is available.
 *
 * @param props - Remove button props.
 * @returns A remove button or `null` when no remove handler exists.
 */
export const AttachmentRemove = (props: AttachmentRemoveProps) => {
  const { label = "Remove", className, children, ...rest } = props;
  const { onRemove, variant } = useAttachmentContext();

  if (!onRemove) {
    return null;
  }

  return (
    <Button
      aria-label={label}
      className={cn(
        variant === "grid" && [
          "absolute top-2 right-2 size-6 rounded-full p-0",
          "bg-background/80 backdrop-blur-sm",
          "opacity-0 transition-opacity group-hover:opacity-100",
          "hover:bg-background",
          "[&>svg]:size-3",
        ],
        variant === "inline" && [
          "size-6 rounded p-0",
          "opacity-0 transition-opacity group-hover:opacity-100",
          "[&>svg]:size-2.5",
        ],
        variant === "list" && ["size-8 shrink-0 rounded p-0", "[&>svg]:size-4"],
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      type="button"
      variant="ghost"
      {...rest}
    >
      {children ?? <XIcon />}
      <span className="sr-only">{label}</span>
    </Button>
  );
};

// ============================================================================
// AttachmentHoverCard - Hover preview
// ============================================================================

/** Props for the `AttachmentHoverCardProps` type. */
export type AttachmentHoverCardProps = ComponentProps<typeof HoverCard>;

/**
 * Renders a hover card wrapper for attachment previews.
 *
 * @param props - Hover card props.
 * @returns The hover card wrapper.
 */
export const AttachmentHoverCard = (props: AttachmentHoverCardProps) => {
  const { openDelay = 200, closeDelay = 0, ...rest } = props;
  return <HoverCard closeDelay={closeDelay} openDelay={openDelay} {...rest} />;
};

/** Props for the `AttachmentHoverCardTriggerProps` type. */
export type AttachmentHoverCardTriggerProps = ComponentProps<
  typeof HoverCardTrigger
>;

/**
 * Renders the hover card trigger for an attachment.
 *
 * @param props - Hover card trigger props.
 * @returns The hover card trigger element.
 */
export const AttachmentHoverCardTrigger = (
  props: AttachmentHoverCardTriggerProps,
) => <HoverCardTrigger {...props} />;

/** Props for the `AttachmentHoverCardContentProps` type. */
export type AttachmentHoverCardContentProps = ComponentProps<
  typeof HoverCardContent
>;

/**
 * Renders hover card content for attachment preview UI.
 *
 * @param props - Hover card content props.
 * @returns The hover card content container.
 */
export const AttachmentHoverCardContent = (
  props: AttachmentHoverCardContentProps,
) => {
  const { align = "start", className, ...rest } = props;
  return (
    <HoverCardContent
      align={align}
      className={cn("w-auto p-2", className)}
      {...rest}
    />
  );
};

// ============================================================================
// AttachmentEmpty - Empty state
// ============================================================================

/** Props for the `AttachmentEmptyProps` type. */
export type AttachmentEmptyProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the empty state for the attachments container.
 *
 * @param props - Empty state container props.
 * @returns The attachments empty state.
 */
export const AttachmentEmpty = (props: AttachmentEmptyProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn(
        "flex items-center justify-center p-4 text-muted-foreground text-sm",
        className,
      )}
      {...rest}
    >
      {children ?? "No attachments"}
    </div>
  );
};
