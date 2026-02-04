"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import {
  CircleSmallIcon,
  MarsIcon,
  MarsStrokeIcon,
  NonBinaryIcon,
  PauseIcon,
  PlayIcon,
  TransgenderIcon,
  VenusAndMarsIcon,
  VenusIcon,
} from "lucide-react";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface VoiceSelectorContextValue {
  value: string | undefined;
  setValue: (value: string | undefined) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const VoiceSelectorContext = createContext<VoiceSelectorContextValue | null>(
  null,
);

/**
 * Hook to access the voice selector context.
 *
 * @returns The voice selector context value.
 * @throws Error when used outside a `VoiceSelector`.
 */
export const useVoiceSelector = () => {
  const context = useContext(VoiceSelectorContext);
  if (!context) {
    throw new Error(
      "VoiceSelector components must be used within VoiceSelector",
    );
  }
  return context;
};

/**
 * Props for the VoiceSelector component.
 */
export type VoiceSelectorProps = ComponentProps<typeof Dialog> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string | undefined) => void;
};

/**
 * Main VoiceSelector component that provides context and manages state.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelector = (props: VoiceSelectorProps) => {
  const {
    value: valueProp,
    defaultValue,
    onValueChange,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    children,
    ...rest
  } = props;

  const [value, setValue] = useControllableState({
    defaultProp: defaultValue,
    prop: valueProp,
    ...(onValueChange === undefined ? {} : { onChange: onValueChange }),
  });

  const [open, setOpen] = useControllableState({
    defaultProp: defaultOpen,
    prop: openProp,
    ...(onOpenChange === undefined ? {} : { onChange: onOpenChange }),
  });

  const voiceSelectorContext: VoiceSelectorContextValue = {
    open,
    setOpen,
    setValue,
    value,
  };

  return (
    <VoiceSelectorContext.Provider value={voiceSelectorContext}>
      <Dialog onOpenChange={setOpen} open={open} {...rest}>
        {children}
      </Dialog>
    </VoiceSelectorContext.Provider>
  );
};

/**
 * Props for the VoiceSelectorTrigger component.
 */
export type VoiceSelectorTriggerProps = ComponentProps<typeof DialogTrigger>;

/**
 * Trigger component for the voice selector.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorTrigger = (props: VoiceSelectorTriggerProps) => (
  <DialogTrigger {...props} />
);

/**
 * Props for the VoiceSelectorContent component.
 */
export type VoiceSelectorContentProps = ComponentProps<typeof DialogContent> & {
  title?: ReactNode;
};

/**
 * Content component for the voice selector dialog.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorContent = (props: VoiceSelectorContentProps) => {
  const { className, children, title = "Voice Selector", ...rest } = props;
  return (
    <DialogContent className={cn("p-0", className)} {...rest}>
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <Command className="[&_[data-slot=command-input-wrapper]]:h-auto">
        {children}
      </Command>
    </DialogContent>
  );
};

/**
 * Props for the VoiceSelectorDialog component.
 */
export type VoiceSelectorDialogProps = ComponentProps<typeof CommandDialog>;

/**
 * Dialog component for the voice selector.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorDialog = (props: VoiceSelectorDialogProps) => (
  <CommandDialog {...props} />
);

/**
 * Props for the VoiceSelectorInput component.
 */
export type VoiceSelectorInputProps = ComponentProps<typeof CommandInput>;

/**
 * Input component for the voice selector search.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorInput = (props: VoiceSelectorInputProps) => {
  const { className, ...rest } = props;
  return (
    <CommandInput
      aria-label={rest["aria-label"] ?? "Search voices"}
      className={cn("h-auto py-3.5", className)}
      {...rest}
    />
  );
};

/**
 * Props for the VoiceSelectorList component.
 */
export type VoiceSelectorListProps = ComponentProps<typeof CommandList>;

/**
 * List component for the voice selector items.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorList = (props: VoiceSelectorListProps) => (
  <CommandList {...props} />
);

/**
 * Props for the VoiceSelectorEmpty component.
 */
export type VoiceSelectorEmptyProps = ComponentProps<typeof CommandEmpty>;

/**
 * Empty state component for the voice selector.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorEmpty = (props: VoiceSelectorEmptyProps) => (
  <CommandEmpty {...props} />
);

/**
 * Props for the VoiceSelectorGroup component.
 */
export type VoiceSelectorGroupProps = ComponentProps<typeof CommandGroup>;

/**
 * Group component for categorizing voice selector items.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorGroup = (props: VoiceSelectorGroupProps) => (
  <CommandGroup {...props} />
);

/**
 * Props for the VoiceSelectorItem component.
 */
export type VoiceSelectorItemProps = ComponentProps<typeof CommandItem>;

/**
 * Individual item component for a voice selection.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorItem = (props: VoiceSelectorItemProps) => {
  const { className, ...rest } = props;
  return <CommandItem className={cn("px-4 py-2", className)} {...rest} />;
};

/**
 * Props for the VoiceSelectorShortcut component.
 */
export type VoiceSelectorShortcutProps = ComponentProps<typeof CommandShortcut>;

/**
 * Shortcut component for voice selector items.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorShortcut = (props: VoiceSelectorShortcutProps) => (
  <CommandShortcut {...props} />
);

/**
 * Props for the VoiceSelectorSeparator component.
 */
export type VoiceSelectorSeparatorProps = ComponentProps<
  typeof CommandSeparator
>;

/**
 * Separator component for voice selector groups or items.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorSeparator = (props: VoiceSelectorSeparatorProps) => (
  <CommandSeparator {...props} />
);

/**
 * Props for the VoiceSelectorGender component.
 */
export type VoiceSelectorGenderProps = ComponentProps<"span"> & {
  value?:
    | "male"
    | "female"
    | "transgender"
    | "androgyne"
    | "non-binary"
    | "intersex";
};

/**
 * Gender indicator component for a voice.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorGender = (props: VoiceSelectorGenderProps) => {
  const { className, value, children, ...rest } = props;
  let icon: ReactNode | null = null;

  switch (value) {
    case "male":
      icon = <MarsIcon className="size-4" />;
      break;
    case "female":
      icon = <VenusIcon className="size-4" />;
      break;
    case "transgender":
      icon = <TransgenderIcon className="size-4" />;
      break;
    case "androgyne":
      icon = <MarsStrokeIcon className="size-4" />;
      break;
    case "non-binary":
      icon = <NonBinaryIcon className="size-4" />;
      break;
    case "intersex":
      icon = <VenusAndMarsIcon className="size-4" />;
      break;
    default:
      icon = <CircleSmallIcon className="size-4" />;
  }

  return (
    <span className={cn("text-muted-foreground text-xs", className)} {...rest}>
      {children ?? icon}
    </span>
  );
};

/**
 * Props for the VoiceSelectorAccent component.
 */
export type VoiceSelectorAccentProps = ComponentProps<"span"> & {
  value?:
    | "american"
    | "british"
    | "australian"
    | "canadian"
    | "irish"
    | "scottish"
    | "indian"
    | "south-african"
    | "new-zealand"
    | "spanish"
    | "french"
    | "german"
    | "italian"
    | "portuguese"
    | "brazilian"
    | "mexican"
    | "argentinian"
    | "japanese"
    | "chinese"
    | "korean"
    | "russian"
    | "arabic"
    | "dutch"
    | "swedish"
    | "norwegian"
    | "danish"
    | "finnish"
    | "polish"
    | "turkish"
    | "greek"
    | string;
};

/**
 * Accent indicator component for a voice, typically showing a flag emoji.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorAccent = (props: VoiceSelectorAccentProps) => {
  const { className, value, children, ...rest } = props;
  let emoji: string | null = null;

  switch (value) {
    case "american":
      emoji = "🇺🇸";
      break;
    case "british":
      emoji = "🇬🇧";
      break;
    case "australian":
      emoji = "🇦🇺";
      break;
    case "canadian":
      emoji = "🇨🇦";
      break;
    case "irish":
      emoji = "🇮🇪";
      break;
    case "scottish":
      emoji = "🏴󠁧󠁢󠁳󠁣󠁴󠁿";
      break;
    case "indian":
      emoji = "🇮🇳";
      break;
    case "south-african":
      emoji = "🇿🇦";
      break;
    case "new-zealand":
      emoji = "🇳🇿";
      break;
    case "spanish":
      emoji = "🇪🇸";
      break;
    case "french":
      emoji = "🇫🇷";
      break;
    case "german":
      emoji = "🇩🇪";
      break;
    case "italian":
      emoji = "🇮🇹";
      break;
    case "portuguese":
      emoji = "🇵🇹";
      break;
    case "brazilian":
      emoji = "🇧🇷";
      break;
    case "mexican":
      emoji = "🇲🇽";
      break;
    case "argentinian":
      emoji = "🇦🇷";
      break;
    case "japanese":
      emoji = "🇯🇵";
      break;
    case "chinese":
      emoji = "🇨🇳";
      break;
    case "korean":
      emoji = "🇰🇷";
      break;
    case "russian":
      emoji = "🇷🇺";
      break;
    case "arabic":
      emoji = "🇸🇦";
      break;
    case "dutch":
      emoji = "🇳🇱";
      break;
    case "swedish":
      emoji = "🇸🇪";
      break;
    case "norwegian":
      emoji = "🇳🇴";
      break;
    case "danish":
      emoji = "🇩🇰";
      break;
    case "finnish":
      emoji = "🇫🇮";
      break;
    case "polish":
      emoji = "🇵🇱";
      break;
    case "turkish":
      emoji = "🇹🇷";
      break;
    case "greek":
      emoji = "🇬🇷";
      break;
    default:
      emoji = null;
  }

  return (
    <span className={cn("text-muted-foreground text-xs", className)} {...rest}>
      {children ?? emoji}
    </span>
  );
};

/**
 * Props for the VoiceSelectorAge component.
 */
export type VoiceSelectorAgeProps = ComponentProps<"span">;

/**
 * Age indicator component for a voice.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorAge = (props: VoiceSelectorAgeProps) => {
  const { className, ...rest } = props;
  return (
    <span
      className={cn("text-muted-foreground text-xs tabular-nums", className)}
      {...rest}
    />
  );
};

/**
 * Props for the VoiceSelectorName component.
 */
export type VoiceSelectorNameProps = ComponentProps<"span">;

/**
 * Component for displaying the name of a voice.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorName = (props: VoiceSelectorNameProps) => {
  const { className, ...rest } = props;
  return (
    <span
      className={cn("flex-1 truncate text-left font-medium", className)}
      {...rest}
    />
  );
};

/**
 * Props for the VoiceSelectorDescription component.
 */
export type VoiceSelectorDescriptionProps = ComponentProps<"span">;

/**
 * Component for displaying a description of a voice.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorDescription = (
  props: VoiceSelectorDescriptionProps,
) => {
  const { className, ...rest } = props;
  return (
    <span
      className={cn("text-muted-foreground text-xs", className)}
      {...rest}
    />
  );
};

/**
 * Props for the VoiceSelectorAttributes component.
 */
export type VoiceSelectorAttributesProps = ComponentProps<"div">;

/**
 * Container component for voice attributes (gender, age, accent).
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorAttributes = (
  props: VoiceSelectorAttributesProps,
) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("flex items-center text-xs", className)} {...rest}>
      {children}
    </div>
  );
};

/**
 * Props for the VoiceSelectorBullet component.
 */
export type VoiceSelectorBulletProps = ComponentProps<"span">;

/**
 * Bullet separator component for items within attributes.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorBullet = (props: VoiceSelectorBulletProps) => {
  const { className, ...rest } = props;
  return (
    <span
      aria-hidden="true"
      className={cn("select-none text-border", className)}
      {...rest}
    >
      &bull;
    </span>
  );
};

/**
 * Props for the VoiceSelectorPreview component.
 */
export type VoiceSelectorPreviewProps = Omit<
  ComponentProps<"button">,
  "children"
> & {
  state?: "idle" | "loading" | "playing";
  onPlay?: () => void;
};

/**
 * Preview button component to play/pause a sample of the voice.
 *
 * @param props - The component props.
 * @returns - The rendered component.
 */
export const VoiceSelectorPreview = (props: VoiceSelectorPreviewProps) => {
  const { className, state = "idle", onPlay, onClick, ...rest } = props;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick?.(event);
    onPlay?.();
  };

  const isLoading = state === "loading";
  const isPlaying = state === "playing";

  let icon = <PlayIcon className="size-3" />;

  if (isLoading) {
    icon = <Spinner className="size-3" />;
  } else if (isPlaying) {
    icon = <PauseIcon className="size-3" />;
  }

  return (
    <Button
      aria-label={isPlaying ? "Pause preview" : "Play preview"}
      className={cn("size-6", className)}
      disabled={isLoading}
      onClick={handleClick}
      size="icon-sm"
      type="button"
      variant="outline"
      {...rest}
    >
      {icon}
    </Button>
  );
};
