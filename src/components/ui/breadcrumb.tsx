import { ChevronRight, MoreHorizontal } from "lucide-react";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

type BreadcrumbProps = React.ComponentProps<"nav">;

type BreadcrumbListProps = React.ComponentProps<"ol">;

type BreadcrumbItemProps = React.ComponentProps<"li">;

type BreadcrumbLinkProps = React.ComponentProps<"a"> & {
  asChild?: boolean;
};

type BreadcrumbPageProps = React.ComponentProps<"span">;

type BreadcrumbSeparatorProps = React.ComponentProps<"li">;

type BreadcrumbEllipsisProps = React.ComponentProps<"span"> & {
  /**
   * Optional screen-reader label for the ellipsis.
   *
   * @remarks
   * Prefer labeling the interactive trigger (e.g., a button) that contains the
   * ellipsis rather than relying on this span's text to name the control.
   */
  label?: string;
};

/**
 * Render an accessible breadcrumb navigation container.
 *
 * @param props - `<nav>` props for the breadcrumb region.
 * @returns A `<nav aria-label="breadcrumb">` element.
 */
export function Breadcrumb(props: BreadcrumbProps) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}

/**
 * Render the ordered-list wrapper for breadcrumb items and separators.
 *
 * @param props - `<ol>` props for the breadcrumb list.
 * @returns An `<ol>` element styled for breadcrumb layout.
 */
export function BreadcrumbList(props: BreadcrumbListProps) {
  const { className, ...rest } = props;
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Render a single breadcrumb item container.
 *
 * @param props - `<li>` props for the breadcrumb item.
 * @returns An `<li>` element used to wrap a link/page and adjacent separators.
 */
export function BreadcrumbItem(props: BreadcrumbItemProps) {
  const { className, ...rest } = props;
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1.5", className)}
      {...rest}
    />
  );
}

/**
 * Render a breadcrumb link.
 *
 * @param props - Link props; pass `asChild` to render a custom anchor-like element via Radix Slot.
 * @returns A link element representing a navigable breadcrumb segment.
 */
export function BreadcrumbLink(props: BreadcrumbLinkProps) {
  const { asChild, className, ...rest } = props;
  const Comp = asChild ? Slot.Root : "a";

  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn("hover:text-foreground transition-colors", className)}
      {...rest}
    />
  );
}

/**
 * Render the current breadcrumb page label.
 *
 * @param props - `<span>` props for the active page label.
 * @returns A `<span aria-current="page">` element.
 */
export function BreadcrumbPage(props: BreadcrumbPageProps) {
  const { className, ...rest } = props;
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("text-foreground font-normal", className)}
      {...rest}
    />
  );
}

/**
 * Render a separator between breadcrumb items.
 *
 * @param props - `<li>` props for the separator; `children` overrides the default chevron icon.
 * @returns A presentational `<li>` separator (aria-hidden).
 */
export function BreadcrumbSeparator(props: BreadcrumbSeparatorProps) {
  const { children, className, ...rest } = props;
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...rest}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}

/**
 * Render an ellipsis placeholder for collapsed breadcrumb segments.
 *
 * @param props - `<span>` props for the ellipsis wrapper and an optional screen-reader `label`.
 * @returns A `<span>` containing an icon and screen-reader-only label.
 */
export function BreadcrumbEllipsis(props: BreadcrumbEllipsisProps) {
  const { className, label, ...rest } = props;
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...rest}
    >
      <MoreHorizontal className="size-4" aria-hidden="true" />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
