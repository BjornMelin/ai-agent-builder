"use client";

import { ArrowRightIcon, MinusIcon, PackageIcon, PlusIcon } from "lucide-react";
import {
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
} from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ChangeType = "major" | "minor" | "patch" | "added" | "removed";

interface PackageInfoContextType {
  name: string;
  currentVersion?: string;
  newVersion?: string;
  changeType?: ChangeType;
}

const PackageInfoContext = createContext<PackageInfoContextType>({
  name: "",
});

/** Props for the `PackageInfoProps` type. */
export type PackageInfoProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  currentVersion?: string;
  newVersion?: string;
  changeType?: ChangeType;
};

/**
 * Provides package metadata context and renders a package info container.
 *
 * @param props - Package metadata and container props.
 * @returns A package info block with optional default sections.
 */
export const PackageInfo = (props: PackageInfoProps) => {
  const {
    name,
    currentVersion,
    newVersion,
    changeType,
    className,
    children,
    ...rest
  } = props;

  return (
    <PackageInfoContext.Provider
      value={{
        name,
        ...(currentVersion === undefined ? {} : { currentVersion }),
        ...(newVersion === undefined ? {} : { newVersion }),
        ...(changeType === undefined ? {} : { changeType }),
      }}
    >
      <div
        className={cn("rounded-lg border bg-background p-4", className)}
        {...rest}
      >
        {children ?? (
          <>
            <PackageInfoHeader>
              <PackageInfoName />
              {changeType ? <PackageInfoChangeType /> : null}
            </PackageInfoHeader>
            {currentVersion || newVersion ? <PackageInfoVersion /> : null}
          </>
        )}
      </div>
    </PackageInfoContext.Provider>
  );
};

/** Props for the `PackageInfoHeaderProps` type. */
export type PackageInfoHeaderProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the top row for package name and change indicators.
 *
 * @param props - Header container props.
 * @returns A package info header row.
 */
export const PackageInfoHeader = (props: PackageInfoHeaderProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn("flex items-center justify-between gap-2", className)}
      {...rest}
    >
      {children}
    </div>
  );
};

/** Props for the `PackageInfoNameProps` type. */
export type PackageInfoNameProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the package name, defaulting to the context value when omitted.
 *
 * @param props - Name container props.
 * @returns A package name row with icon.
 */
export const PackageInfoName = (props: PackageInfoNameProps) => {
  const { className, children, ...rest } = props;
  const { name } = useContext(PackageInfoContext);

  return (
    <div className={cn("flex items-center gap-2", className)} {...rest}>
      <PackageIcon
        aria-hidden="true"
        className="size-4 text-muted-foreground"
      />
      <span className="font-medium font-mono text-sm">{children ?? name}</span>
    </div>
  );
};

const changeTypeStyles: Record<ChangeType, string> = {
  added: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  major: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  minor:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  patch: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  removed: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

const changeTypeIcons: Record<ChangeType, ReactNode> = {
  added: <PlusIcon aria-hidden="true" className="size-3" />,
  major: <ArrowRightIcon aria-hidden="true" className="size-3" />,
  minor: <ArrowRightIcon aria-hidden="true" className="size-3" />,
  patch: <ArrowRightIcon aria-hidden="true" className="size-3" />,
  removed: <MinusIcon aria-hidden="true" className="size-3" />,
};

/** Props for the `PackageInfoChangeTypeProps` type. */
export type PackageInfoChangeTypeProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders a badge describing the package change type.
 *
 * @param props - Badge container props.
 * @returns A change-type badge, or `null` when no change type is set.
 */
export const PackageInfoChangeType = (props: PackageInfoChangeTypeProps) => {
  const { className, children, ...rest } = props;
  const { changeType } = useContext(PackageInfoContext);

  if (!changeType) {
    return null;
  }

  return (
    <Badge
      className={cn(
        "gap-1 text-xs capitalize",
        changeTypeStyles[changeType],
        className,
      )}
      variant="secondary"
      {...rest}
    >
      {changeTypeIcons[changeType]}
      {children ?? changeType}
    </Badge>
  );
};

/** Props for the `PackageInfoVersionProps` type. */
export type PackageInfoVersionProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders current and target package versions.
 *
 * @param props - Version container props.
 * @returns A version row, or `null` when no versions are available.
 */
export const PackageInfoVersion = (props: PackageInfoVersionProps) => {
  const { className, children, ...rest } = props;
  const { currentVersion, newVersion } = useContext(PackageInfoContext);

  if (!(currentVersion || newVersion)) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-2 flex items-center gap-2 font-mono text-muted-foreground text-sm",
        className,
      )}
      {...rest}
    >
      {children ?? (
        <>
          {currentVersion ? <span>{currentVersion}</span> : null}
          {currentVersion && newVersion ? (
            <ArrowRightIcon aria-hidden="true" className="size-3" />
          ) : null}
          {newVersion ? (
            <span className="font-medium text-foreground">{newVersion}</span>
          ) : null}
        </>
      )}
    </div>
  );
};

/** Props for the `PackageInfoDescriptionProps` type. */
export type PackageInfoDescriptionProps = HTMLAttributes<HTMLParagraphElement>;

/**
 * Renders descriptive text under package metadata.
 *
 * @param props - Paragraph props.
 * @returns A package description paragraph.
 */
export const PackageInfoDescription = (props: PackageInfoDescriptionProps) => {
  const { className, children, ...rest } = props;
  return (
    <p
      className={cn("mt-2 text-muted-foreground text-sm", className)}
      {...rest}
    >
      {children}
    </p>
  );
};

/** Props for the `PackageInfoContentProps` type. */
export type PackageInfoContentProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the main details section below package summary fields.
 *
 * @param props - Content container props.
 * @returns A package details container.
 */
export const PackageInfoContent = (props: PackageInfoContentProps) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("mt-3 border-t pt-3", className)} {...rest}>
      {children}
    </div>
  );
};

/** Props for the `PackageInfoDependenciesProps` type. */
export type PackageInfoDependenciesProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders a titled list container for dependency entries.
 *
 * @param props - Dependencies section props.
 * @returns A dependency list section.
 */
export const PackageInfoDependencies = (
  props: PackageInfoDependenciesProps,
) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("space-y-2", className)} {...rest}>
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Dependencies
      </span>
      <div className="space-y-1">{children}</div>
    </div>
  );
};

/** Props for the `PackageInfoDependencyProps` type. */
export type PackageInfoDependencyProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  version?: string;
};

/**
 * Renders a single dependency name/version row.
 *
 * @param props - Dependency fields and row props.
 * @returns A dependency row element.
 */
export const PackageInfoDependency = (props: PackageInfoDependencyProps) => {
  const { name, version, className, children, ...rest } = props;
  return (
    <div
      className={cn("flex items-center justify-between text-sm", className)}
      {...rest}
    >
      {children ?? (
        <>
          <span className="font-mono text-muted-foreground">{name}</span>
          {version ? (
            <span className="font-mono text-xs">{version}</span>
          ) : null}
        </>
      )}
    </div>
  );
};
