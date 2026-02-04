"use client";

import { ChevronDownIcon } from "lucide-react";
import type {
  ChangeEvent,
  ComponentProps,
  KeyboardEvent,
  ReactNode,
} from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const sanitizeUrl = (rawUrl: string) => {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return "";
  }

  const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
};

export interface WebPreviewContextValue {
  url: string;
  setUrl: (url: string) => void;
  consoleOpen: boolean;
  setConsoleOpen: (open: boolean) => void;
}

const WebPreviewContext = createContext<WebPreviewContextValue | null>(null);

const useWebPreview = () => {
  const context = useContext(WebPreviewContext);
  if (!context) {
    throw new Error("WebPreview components must be used within a WebPreview");
  }
  return context;
};

export type WebPreviewProps = ComponentProps<"div"> & {
  defaultUrl?: string;
  onUrlChange?: (url: string) => void;
};

/**
 * Provides web preview state and renders the root preview container.
 *
 * @param props - Root web preview props.
 * @returns The web preview root.
 */
export const WebPreview = (props: WebPreviewProps) => {
  const { className, children, defaultUrl = "", onUrlChange, ...rest } = props;
  const [url, setUrl] = useState(defaultUrl);
  const [consoleOpen, setConsoleOpen] = useState(false);

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    onUrlChange?.(newUrl);
  };

  const contextValue: WebPreviewContextValue = {
    consoleOpen,
    setConsoleOpen,
    setUrl: handleUrlChange,
    url,
  };

  return (
    <WebPreviewContext.Provider value={contextValue}>
      <div
        className={cn(
          "flex size-full flex-col rounded-lg border bg-card",
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    </WebPreviewContext.Provider>
  );
};

export type WebPreviewNavigationProps = ComponentProps<"div">;

/**
 * Renders the navigation bar area for preview controls.
 *
 * @param props - Navigation container props.
 * @returns The navigation bar.
 */
export const WebPreviewNavigation = (props: WebPreviewNavigationProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn("flex items-center gap-1 border-b p-2", className)}
      {...rest}
    >
      {children}
    </div>
  );
};

export type WebPreviewNavigationButtonProps = ComponentProps<typeof Button> & {
  tooltip?: string;
};

/**
 * Renders a navigation control button with optional tooltip.
 *
 * @param props - Navigation button props.
 * @returns A button element, optionally wrapped with tooltip UI.
 */
export const WebPreviewNavigationButton = (
  props: WebPreviewNavigationButtonProps,
) => {
  const { onClick, disabled, tooltip, children, ...rest } = props;
  const button = (
    <Button
      className="h-8 w-8 p-0 hover:text-foreground"
      disabled={disabled}
      onClick={onClick}
      size="sm"
      variant="ghost"
      {...rest}
    >
      {children}
    </Button>
  );

  if (!tooltip) {
    return button;
  }

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
};

export type WebPreviewUrlProps = ComponentProps<typeof Input>;

/**
 * Renders and manages the preview URL input field.
 *
 * @param props - URL input props.
 * @returns The URL input component.
 */
export const WebPreviewUrl = (props: WebPreviewUrlProps) => {
  const { value, onChange, onKeyDown, ...rest } = props;
  const { url, setUrl } = useWebPreview();
  const [inputValue, setInputValue] = useState(url);
  const isControlled = value !== undefined;

  // Sync input value with context URL when it changes externally
  useEffect(() => {
    setInputValue(url);
  }, [url]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    onChange?.(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      const target = event.target as HTMLInputElement;
      const sanitized = sanitizeUrl(target.value);
      if (sanitized) {
        setUrl(sanitized);
      }
    }
    onKeyDown?.(event);
  };

  return (
    <Input
      className="h-8 flex-1 text-sm"
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder="Enter URL..."
      value={isControlled ? value : inputValue}
      {...rest}
    />
  );
};

export type WebPreviewBodyProps = ComponentProps<"iframe"> & {
  loading?: ReactNode;
};

/**
 * Renders the iframe body for the web preview.
 *
 * @param props - Iframe props plus loading content.
 * @returns The preview body container.
 */
export const WebPreviewBody = (props: WebPreviewBodyProps) => {
  const { className, loading, src, ...rest } = props;
  const { url } = useWebPreview();
  const resolvedUrl = sanitizeUrl(src ?? url);

  return (
    <div className="flex-1">
      <iframe
        className={cn("size-full", className)}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        src={resolvedUrl || undefined}
        title="Preview"
        {...rest}
      />
      {loading}
    </div>
  );
};

export type WebPreviewConsoleProps = ComponentProps<"div"> & {
  logs?: Array<{
    level: "log" | "warn" | "error";
    message: string;
    timestamp: Date;
  }>;
};

/**
 * Renders a collapsible console panel for preview logs.
 *
 * @param props - Console panel props and log entries.
 * @returns The preview console panel.
 */
export const WebPreviewConsole = (props: WebPreviewConsoleProps) => {
  const { className, logs = [], children, ...rest } = props;
  const { consoleOpen, setConsoleOpen } = useWebPreview();

  return (
    <Collapsible
      className={cn("border-t bg-muted/50 font-mono text-sm", className)}
      onOpenChange={setConsoleOpen}
      open={consoleOpen}
      {...rest}
    >
      <CollapsibleTrigger asChild>
        <Button
          className="flex w-full items-center justify-between p-4 text-left font-medium hover:bg-muted/50"
          variant="ghost"
        >
          Console
          <ChevronDownIcon
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              consoleOpen && "rotate-180",
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "px-4 pb-4",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        )}
      >
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-muted-foreground">No console output</p>
          ) : (
            logs.map((log, index) => (
              <div
                className={cn(
                  "text-xs",
                  log.level === "error" && "text-destructive",
                  log.level === "warn" && "text-yellow-600",
                  log.level === "log" && "text-foreground",
                )}
                key={`${log.timestamp.getTime()}-${index}`}
              >
                <span className="text-muted-foreground">
                  {log.timestamp.toLocaleTimeString()}
                </span>{" "}
                {log.message}
              </div>
            ))
          )}
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
