"use client";

import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useState,
} from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface FileTreeContextType {
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  selectedPath?: string;
  onSelect?: (path: string) => void;
}

const FileTreeContext = createContext<FileTreeContextType>({
  expandedPaths: new Set(),
  togglePath: () => undefined,
});

/** Props for the FileTree component. */
export type FileTreeProps = HTMLAttributes<HTMLDivElement> & {
  expanded?: Set<string>;
  defaultExpanded?: Set<string>;
  selectedPath?: string;
  onSelect?: (path: string) => void;
  onExpandedChange?: (expanded: Set<string>) => void;
};

/**
 * Renders a file tree container with expansion and selection state.
 *
 * @param props - Tree props including expansion and selection handlers.
 * @returns A file tree element with context.
 */
export const FileTree = (props: FileTreeProps) => {
  const {
    expanded: controlledExpanded,
    defaultExpanded = new Set(),
    selectedPath,
    onSelect,
    onExpandedChange,
    className,
    children,
    ...rest
  } = props;
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expandedPaths = controlledExpanded ?? internalExpanded;

  const togglePath = (path: string) => {
    if (controlledExpanded !== undefined) {
      const nextExpanded = new Set(controlledExpanded);
      if (nextExpanded.has(path)) {
        nextExpanded.delete(path);
      } else {
        nextExpanded.add(path);
      }
      onExpandedChange?.(nextExpanded);
      return;
    }

    setInternalExpanded((previousExpanded) => {
      const nextExpanded = new Set(previousExpanded);
      if (nextExpanded.has(path)) {
        nextExpanded.delete(path);
      } else {
        nextExpanded.add(path);
      }
      onExpandedChange?.(nextExpanded);
      return nextExpanded;
    });
  };

  return (
    <FileTreeContext.Provider
      value={{
        expandedPaths,
        togglePath,
        ...(selectedPath === undefined ? {} : { selectedPath }),
        ...(onSelect === undefined ? {} : { onSelect }),
      }}
    >
      <div
        className={cn(
          "rounded-lg border bg-background font-mono text-sm",
          className,
        )}
        role="tree"
        {...rest}
      >
        <div className="p-2">{children}</div>
      </div>
    </FileTreeContext.Provider>
  );
};

interface FileTreeFolderContextType {
  path: string;
  name: string;
  isExpanded: boolean;
}

const FileTreeFolderContext = createContext<FileTreeFolderContextType>({
  isExpanded: false,
  name: "",
  path: "",
});

/** Props for the FileTreeFolder component. */
export type FileTreeFolderProps = ComponentProps<"button"> & {
  path: string;
  name: string;
};

/**
 * Renders a folder row with collapsible children.
 *
 * @param props - Folder props including path and name.
 * @returns A folder tree item element.
 */
export const FileTreeFolder = (props: FileTreeFolderProps) => {
  const { path, name, className, children, onClick, ...rest } = props;
  const { expandedPaths, togglePath, selectedPath, onSelect } =
    useContext(FileTreeContext);
  const isExpanded = expandedPaths.has(path);
  const isSelected = selectedPath === path;

  return (
    <FileTreeFolderContext.Provider value={{ isExpanded, name, path }}>
      <Collapsible onOpenChange={() => togglePath(path)} open={isExpanded}>
        <CollapsibleTrigger asChild>
          <button
            aria-expanded={isExpanded}
            aria-selected={isSelected}
            className={cn(
              "flex w-full items-center gap-1 rounded px-2 py-1 text-left transition-colors hover:bg-muted/50",
              isSelected && "bg-muted",
              className,
            )}
            onClick={(event) => {
              onClick?.(event);
              if (!event.defaultPrevented) {
                onSelect?.(path);
              }
            }}
            role="treeitem"
            type="button"
            {...rest}
          >
            <ChevronRightIcon
              className={cn(
                "size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-reduce:transform-none motion-reduce:transition-none",
                isExpanded && "motion-safe:rotate-90",
              )}
            />
            <FileTreeIcon>
              {isExpanded ? (
                <FolderOpenIcon className="size-4 text-blue-500" />
              ) : (
                <FolderIcon className="size-4 text-blue-500" />
              )}
            </FileTreeIcon>
            <FileTreeName>{name}</FileTreeName>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-4 border-l pl-2">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </FileTreeFolderContext.Provider>
  );
};

interface FileTreeFileContextType {
  path: string;
  name: string;
}

const FileTreeFileContext = createContext<FileTreeFileContextType>({
  name: "",
  path: "",
});

/** Props for the FileTreeFile component. */
export type FileTreeFileProps = ComponentProps<"button"> & {
  path: string;
  name: string;
  icon?: ReactNode;
};

/**
 * Renders a selectable file row.
 *
 * @param props - File props including path, name, and optional icon.
 * @returns A file tree item element.
 */
export const FileTreeFile = (props: FileTreeFileProps) => {
  const { path, name, icon, className, children, onClick, ...rest } = props;
  const { selectedPath, onSelect } = useContext(FileTreeContext);
  const isSelected = selectedPath === path;

  return (
    <FileTreeFileContext.Provider value={{ name, path }}>
      <button
        aria-selected={isSelected}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1 rounded px-2 py-1 text-left transition-colors hover:bg-muted/50",
          isSelected && "bg-muted",
          className,
        )}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            onSelect?.(path);
          }
        }}
        role="treeitem"
        type="button"
        {...rest}
      >
        {children ?? (
          <>
            <span className="size-4" /> {/* Spacer for alignment */}
            <FileTreeIcon>
              {icon ?? <FileIcon className="size-4 text-muted-foreground" />}
            </FileTreeIcon>
            <FileTreeName>{name}</FileTreeName>
          </>
        )}
      </button>
    </FileTreeFileContext.Provider>
  );
};

/** Props for the FileTreeIcon component. */
export type FileTreeIconProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Renders a leading icon for a file tree item.
 *
 * @param props - Span props and optional children.
 * @returns An icon wrapper element.
 */
export const FileTreeIcon = (props: FileTreeIconProps) => {
  const { className, children, ...rest } = props;
  return (
    <span className={cn("shrink-0", className)} {...rest}>
      {children}
    </span>
  );
};

/** Props for the FileTreeName component. */
export type FileTreeNameProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Renders the file or folder name.
 *
 * @param props - Span props and optional children.
 * @returns A name element.
 */
export const FileTreeName = (props: FileTreeNameProps) => {
  const { className, children, ...rest } = props;
  return (
    <span className={cn("truncate", className)} {...rest}>
      {children}
    </span>
  );
};

/** Props for the FileTreeActions component. */
export type FileTreeActionsProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders an actions container for a file tree item.
 *
 * @param props - Container props and optional children.
 * @returns An actions container element.
 */
export const FileTreeActions = (props: FileTreeActionsProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn("ml-auto flex items-center gap-1", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="none"
      {...rest}
    >
      {children}
    </div>
  );
};
