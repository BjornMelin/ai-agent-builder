"use client";

import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Props for the ModelSelector component. */
export type ModelSelectorProps = ComponentProps<typeof Dialog>;

/**
 * Renders a dialog wrapper for the model selector.
 *
 * @param props - Dialog props for the selector.
 * @returns A dialog element.
 */
export const ModelSelector = (props: ModelSelectorProps) => (
  <Dialog {...props} />
);

/** Props for the ModelSelectorTrigger component. */
export type ModelSelectorTriggerProps = ComponentProps<typeof DialogTrigger>;

/**
 * Renders the trigger button for the model selector dialog.
 *
 * @param props - Dialog trigger props.
 * @returns A trigger element.
 */
export const ModelSelectorTrigger = (props: ModelSelectorTriggerProps) => (
  <DialogTrigger {...props} />
);

/** Props for the ModelSelectorContent component. */
export type ModelSelectorContentProps = ComponentProps<typeof DialogContent> & {
  title?: ReactNode;
};

/**
 * Renders the dialog content for the model selector list.
 *
 * @param props - Dialog content props including optional title.
 * @returns A dialog content element.
 */
export const ModelSelectorContent = (props: ModelSelectorContentProps) => {
  const { className, children, title = "Model Selector", ...rest } = props;
  return (
    <DialogContent
      className={cn(
        "outline! border-none! p-0 outline-border! outline-solid!",
        className,
      )}
      {...rest}
    >
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <Command className="**:data-[slot=command-input-wrapper]:h-auto">
        {children}
      </Command>
    </DialogContent>
  );
};

/** Props for the ModelSelectorDialog component. */
export type ModelSelectorDialogProps = ComponentProps<typeof CommandDialog>;

/**
 * Renders a command dialog for the model selector.
 *
 * @param props - Command dialog props.
 * @returns A command dialog element.
 */
export const ModelSelectorDialog = (props: ModelSelectorDialogProps) => (
  <CommandDialog {...props} />
);

/** Props for the ModelSelectorInput component. */
export type ModelSelectorInputProps = ComponentProps<typeof CommandInput>;

/**
 * Renders the search input for the model selector.
 *
 * @param props - Command input props.
 * @returns A command input element.
 */
export const ModelSelectorInput = (props: ModelSelectorInputProps) => {
  const { className, ...rest } = props;
  return (
    <CommandInput
      aria-label={rest["aria-label"] ?? "Search models"}
      className={cn("h-auto py-3.5", className)}
      {...rest}
    />
  );
};

/** Props for the ModelSelectorList component. */
export type ModelSelectorListProps = ComponentProps<typeof CommandList>;

/**
 * Renders the list container for model options.
 *
 * @param props - Command list props.
 * @returns A command list element.
 */
export const ModelSelectorList = (props: ModelSelectorListProps) => (
  <CommandList {...props} />
);

/** Props for the ModelSelectorEmpty component. */
export type ModelSelectorEmptyProps = ComponentProps<typeof CommandEmpty>;

/**
 * Renders the empty state for the model list.
 *
 * @param props - Command empty props.
 * @returns A command empty element.
 */
export const ModelSelectorEmpty = (props: ModelSelectorEmptyProps) => (
  <CommandEmpty {...props} />
);

/** Props for the ModelSelectorGroup component. */
export type ModelSelectorGroupProps = ComponentProps<typeof CommandGroup>;

/**
 * Renders a group container for model options.
 *
 * @param props - Command group props.
 * @returns A command group element.
 */
export const ModelSelectorGroup = (props: ModelSelectorGroupProps) => (
  <CommandGroup {...props} />
);

/** Props for the ModelSelectorItem component. */
export type ModelSelectorItemProps = ComponentProps<typeof CommandItem>;

/**
 * Renders a single model option item.
 *
 * @param props - Command item props.
 * @returns A command item element.
 */
export const ModelSelectorItem = (props: ModelSelectorItemProps) => (
  <CommandItem {...props} />
);

/** Props for the ModelSelectorShortcut component. */
export type ModelSelectorShortcutProps = ComponentProps<typeof CommandShortcut>;

/**
 * Renders a keyboard shortcut indicator for a model option.
 *
 * @param props - Command shortcut props.
 * @returns A command shortcut element.
 */
export const ModelSelectorShortcut = (props: ModelSelectorShortcutProps) => (
  <CommandShortcut {...props} />
);

/** Props for the ModelSelectorSeparator component. */
export type ModelSelectorSeparatorProps = ComponentProps<
  typeof CommandSeparator
>;

/**
 * Renders a separator between groups of model options.
 *
 * @param props - Command separator props.
 * @returns A command separator element.
 */
export const ModelSelectorSeparator = (props: ModelSelectorSeparatorProps) => (
  <CommandSeparator {...props} />
);

/** Props for the ModelSelectorLogo component. */
export type ModelSelectorLogoProps = Omit<
  ComponentProps<typeof Image>,
  "src" | "alt"
> & {
  provider:
    | "moonshotai-cn"
    | "lucidquery"
    | "moonshotai"
    | "zai-coding-plan"
    | "alibaba"
    | "xai"
    | "vultr"
    | "nvidia"
    | "upstage"
    | "groq"
    | "github-copilot"
    | "mistral"
    | "vercel"
    | "nebius"
    | "deepseek"
    | "alibaba-cn"
    | "google-vertex-anthropic"
    | "venice"
    | "chutes"
    | "cortecs"
    | "github-models"
    | "togetherai"
    | "azure"
    | "baseten"
    | "huggingface"
    | "opencode"
    | "fastrouter"
    | "google"
    | "google-vertex"
    | "cloudflare-workers-ai"
    | "inception"
    | "wandb"
    | "openai"
    | "zhipuai-coding-plan"
    | "perplexity"
    | "openrouter"
    | "zenmux"
    | "v0"
    | "iflowcn"
    | "synthetic"
    | "deepinfra"
    | "zhipuai"
    | "submodel"
    | "zai"
    | "inference"
    | "requesty"
    | "morph"
    | "lmstudio"
    | "anthropic"
    | "aihubmix"
    | "fireworks-ai"
    | "modelscope"
    | "llama"
    | "scaleway"
    | "amazon-bedrock"
    | "cerebras"
    | (string & {});
};

/**
 * Renders a provider logo for a model.
 *
 * @param props - Image props including provider id.
 * @returns A provider logo image element.
 */
export const ModelSelectorLogo = (props: ModelSelectorLogoProps) => {
  const { provider, className, ...rest } = props;
  return (
    <Image
      {...rest}
      alt={`${provider} logo`}
      className={cn("size-3 dark:invert", className)}
      height={12}
      sizes="12px"
      src={`https://models.dev/logos/${provider}.svg`}
      width={12}
    />
  );
};

/** Props for the ModelSelectorLogoGroup component. */
export type ModelSelectorLogoGroupProps = ComponentProps<"div">;

/**
 * Renders a stack of provider logos.
 *
 * @param props - Div props for the logo group.
 * @returns A logo group element.
 */
export const ModelSelectorLogoGroup = (props: ModelSelectorLogoGroupProps) => {
  const { className, ...rest } = props;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center -space-x-1 [&>img]:rounded-full [&>img]:bg-background [&>img]:p-px [&>img]:ring-1 dark:[&>img]:bg-foreground",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the ModelSelectorName component. */
export type ModelSelectorNameProps = ComponentProps<"span">;

/**
 * Renders the model name text.
 *
 * @param props - Span props for the model name.
 * @returns A name element.
 */
export const ModelSelectorName = (props: ModelSelectorNameProps) => {
  const { className, ...rest } = props;
  return (
    <span className={cn("flex-1 truncate text-left", className)} {...rest} />
  );
};
