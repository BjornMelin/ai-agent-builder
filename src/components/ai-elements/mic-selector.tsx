"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { ChevronsUpDownIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const deviceIdRegex = /\(([\da-fA-F]{4}:[\da-fA-F]{4})\)$/;

interface MicSelectorContextType {
  data: MediaDeviceInfo[];
  value: string | undefined;
  onValueChange?: (value: string) => void;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  width: number;
  setWidth?: (width: number) => void;
}

const MicSelectorContext = createContext<MicSelectorContextType>({
  data: [],
  open: false,
  value: undefined,
  width: 200,
});

/** Props for the `MicSelector` component. */
export type MicSelectorProps = ComponentProps<typeof Popover> & {
  defaultValue?: string;
  value?: string | undefined;
  onValueChange?: (value: string | undefined) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Provides microphone selection state and popover composition context.
 *
 * @param props - Selector root props.
 * @returns The microphone selector root.
 */
export const MicSelector = (props: MicSelectorProps) => {
  const {
    defaultValue,
    value: controlledValue,
    onValueChange: controlledOnValueChange,
    defaultOpen = false,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    ...rest
  } = props;
  const [value, onValueChange] = useControllableState<string | undefined>({
    defaultProp: defaultValue,
    prop: controlledValue,
    ...(controlledOnValueChange === undefined
      ? {}
      : { onChange: controlledOnValueChange }),
  });
  const [open, onOpenChange] = useControllableState({
    defaultProp: defaultOpen,
    prop: controlledOpen,
    ...(controlledOnOpenChange === undefined
      ? {}
      : { onChange: controlledOnOpenChange }),
  });
  const [width, setWidth] = useState(200);
  const { devices, loading, hasPermission, loadDevices } = useAudioDevices();

  useEffect(() => {
    if (open && !hasPermission && !loading) {
      loadDevices();
    }
  }, [open, hasPermission, loading, loadDevices]);

  return (
    <MicSelectorContext.Provider
      value={{
        data: devices,
        onOpenChange,
        onValueChange,
        open,
        setWidth,
        value,
        width,
      }}
    >
      <Popover {...rest} onOpenChange={onOpenChange} open={open} />
    </MicSelectorContext.Provider>
  );
};

/** Props for the `MicSelectorTrigger` component. */
export type MicSelectorTriggerProps = ComponentProps<typeof Button>;

/**
 * Renders the trigger button used to open microphone selection.
 *
 * @param props - Trigger button props.
 * @returns A popover trigger button.
 */
export const MicSelectorTrigger = (props: MicSelectorTriggerProps) => {
  const { children, ...rest } = props;
  const { setWidth } = useContext(MicSelectorContext);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Create a ResizeObserver to detect width changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = (entry.target as HTMLElement).offsetWidth;
        if (newWidth) {
          setWidth?.(newWidth);
        }
      }
    });

    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    // Clean up the observer when component unmounts
    return () => {
      resizeObserver.disconnect();
    };
  }, [setWidth]);

  return (
    <PopoverTrigger asChild>
      <Button variant="outline" {...rest} ref={ref}>
        {children}
        <ChevronsUpDownIcon
          className="shrink-0 text-muted-foreground"
          size={16}
        />
      </Button>
    </PopoverTrigger>
  );
};

/** Props for the `MicSelectorContent` component. */
export type MicSelectorContentProps = ComponentProps<typeof Command> & {
  popoverOptions?: ComponentProps<typeof PopoverContent>;
};

/**
 * Renders the command palette content for microphone options.
 *
 * @param props - Command content and popover options.
 * @returns The selector content panel.
 */
export const MicSelectorContent = (props: MicSelectorContentProps) => {
  const { className, popoverOptions, ...rest } = props;
  const { width, onValueChange, value } = useContext(MicSelectorContext);

  return (
    <PopoverContent
      className={cn("p-0", className)}
      style={{ width }}
      {...popoverOptions}
    >
      <Command
        {...(onValueChange === undefined ? {} : { onValueChange })}
        {...(value === undefined ? {} : { value })}
        {...rest}
      />
    </PopoverContent>
  );
};

/** Props for the `MicSelectorInput` component. */
export type MicSelectorInputProps = ComponentProps<typeof CommandInput> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

/**
 * Renders the search input for microphone filtering.
 *
 * @param props - Command input props.
 * @returns The microphone search input.
 */
export const MicSelectorInput = ({ ...props }: MicSelectorInputProps) => (
  <CommandInput
    aria-label={props["aria-label"] ?? "Search microphones"}
    placeholder="Search microphones…"
    {...props}
  />
);

/** Props for the `MicSelectorList` component. */
export type MicSelectorListProps = Omit<
  ComponentProps<typeof CommandList>,
  "children"
> & {
  children: (devices: MediaDeviceInfo[]) => ReactNode;
};

/**
 * Renders microphone items using a render function.
 *
 * @param props - List props with item renderer.
 * @returns The rendered microphone list.
 */
export const MicSelectorList = (props: MicSelectorListProps) => {
  const { children, ...rest } = props;
  const { data } = useContext(MicSelectorContext);

  return <CommandList {...rest}>{children(data)}</CommandList>;
};

/** Props for the `MicSelectorEmpty` component. */
export type MicSelectorEmptyProps = ComponentProps<typeof CommandEmpty>;

/**
 * Renders empty state text for microphone search.
 *
 * @param props - Empty state props.
 * @returns The empty state component.
 */
export const MicSelectorEmpty = (props: MicSelectorEmptyProps) => {
  const { children = "No microphone found.", ...rest } = props;
  return <CommandEmpty {...rest}>{children}</CommandEmpty>;
};

/** Props for the `MicSelectorItem` component. */
export type MicSelectorItemProps = ComponentProps<typeof CommandItem>;

/**
 * Renders a selectable microphone item.
 *
 * @param props - Command item props.
 * @returns A microphone option item.
 */
export const MicSelectorItem = (props: MicSelectorItemProps) => {
  const { onSelect, ...rest } = props;
  const { onValueChange, onOpenChange } = useContext(MicSelectorContext);

  return (
    <CommandItem
      {...rest}
      onSelect={(currentValue) => {
        onSelect?.(currentValue);
        onValueChange?.(currentValue);
        onOpenChange?.(false);
      }}
    />
  );
};

/** Props for the `MicSelectorLabel` component. */
export type MicSelectorLabelProps = ComponentProps<"span"> & {
  device: MediaDeviceInfo;
};

/**
 * Renders a microphone label with optional extracted device id.
 *
 * @param props - Device label props.
 * @returns A formatted microphone label.
 */
export const MicSelectorLabel = (props: MicSelectorLabelProps) => {
  const { device, className, ...rest } = props;
  const matches = device.label.match(deviceIdRegex);

  if (!matches) {
    return (
      <span className={className} {...rest}>
        {device.label}
      </span>
    );
  }

  const [, deviceId] = matches;
  const name = device.label.replace(deviceIdRegex, "");

  return (
    <span className={className} {...rest}>
      <span>{name}</span>
      <span className="text-muted-foreground"> ({deviceId})</span>
    </span>
  );
};

/** Props for the `MicSelectorValue` component. */
export type MicSelectorValueProps = ComponentProps<"span">;

/**
 * Renders the currently selected microphone label.
 *
 * @param props - Value display props.
 * @returns The selected microphone text.
 */
export const MicSelectorValue = (props: MicSelectorValueProps) => {
  const { className, ...rest } = props;
  const { data, value } = useContext(MicSelectorContext);
  const currentDevice = data.find((d) => d.deviceId === value);

  if (!currentDevice) {
    return (
      <span className={cn("flex-1 text-left", className)} {...rest}>
        Select microphone…
      </span>
    );
  }

  return (
    <MicSelectorLabel
      className={cn("flex-1 text-left", className)}
      device={currentDevice}
      {...rest}
    />
  );
};

/**
 * Enumerates available microphone devices and tracks permission state.
 *
 * @returns Device list, loading/error state, permission status, and a function to request microphone permission.
 */
export const useAudioDevices = () => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const loadInFlightRef = useRef(false);

  const beginLoad = () => {
    if (loadInFlightRef.current) {
      return false;
    }
    loadInFlightRef.current = true;
    return true;
  };

  const loadDevicesWithoutPermission = async () => {
    if (!beginLoad()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = deviceList.filter(
        (device) => device.kind === "audioinput",
      );

      setDevices(audioInputs);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to get audio devices";

      setError(message);
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  };

  const loadDevicesWithPermission = async () => {
    if (!beginLoad()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const tempStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      for (const track of tempStream.getTracks()) {
        track.stop();
      }

      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = deviceList.filter(
        (device) => device.kind === "audioinput",
      );

      setDevices(audioInputs);
      setHasPermission(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to get audio devices";

      setError(message);
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  };

  const hasPermissionRef = useRef(hasPermission);
  hasPermissionRef.current = hasPermission;

  const loadDevicesWithPermissionRef = useRef(loadDevicesWithPermission);
  loadDevicesWithPermissionRef.current = loadDevicesWithPermission;

  const loadDevicesWithoutPermissionRef = useRef(loadDevicesWithoutPermission);
  loadDevicesWithoutPermissionRef.current = loadDevicesWithoutPermission;

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setLoading(false);
      setError("Media devices are not available in this browser.");
      return;
    }

    // Safe to detach: the hook stores failures in `error` state.
    void loadDevicesWithoutPermissionRef.current().catch(() => undefined);
  }, []);

  const stableLoadDevices = useRef(() =>
    loadDevicesWithPermissionRef.current(),
  ).current;

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = () => {
      if (hasPermissionRef.current) {
        // Safe to detach: the hook stores failures in `error` state.
        void loadDevicesWithPermissionRef.current().catch(() => undefined);
        return;
      }
      // Safe to detach: the hook stores failures in `error` state.
      void loadDevicesWithoutPermissionRef.current().catch(() => undefined);
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
    };
  }, []);

  return {
    devices,
    error,
    hasPermission,
    loadDevices: stableLoadDevices,
    loading,
  };
};
