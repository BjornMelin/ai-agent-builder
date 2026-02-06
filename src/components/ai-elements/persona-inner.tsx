"use client";

import {
  type RiveParameters,
  useRive,
  useStateMachineInput,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceColor,
} from "@rive-app/react-webgl2";
import type { FC, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Represents the Persona animation state for the avatar. */
export type PersonaState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "asleep";

/**
 * Configures the persona avatar animation state, lifecycle callbacks, and visual variant.
 */
export interface PersonaProps {
  state: PersonaState;
  onLoad?: RiveParameters["onLoad"];
  onLoadError?: RiveParameters["onLoadError"];
  onReady?: () => void;
  onPause?: RiveParameters["onPause"];
  onPlay?: RiveParameters["onPlay"];
  onStop?: RiveParameters["onStop"];
  className?: string;
  variant?: keyof typeof sources;
  isActive?: boolean;
}

// The state machine name is always 'default' for Elements AI visuals
const stateMachine = "default";
const RIVE_BASE_URL = "https://ejiidnob33g9ap1r.public.blob.vercel-storage.com";

const sources = {
  command: {
    dynamicColor: true,
    hasModel: true,
    source: `${RIVE_BASE_URL}/command-2.0.riv`,
  },
  glint: {
    dynamicColor: true,
    hasModel: true,
    source: `${RIVE_BASE_URL}/glint-2.0.riv`,
  },
  halo: {
    dynamicColor: true,
    hasModel: true,
    source: `${RIVE_BASE_URL}/halo-2.0.riv`,
  },
  mana: {
    dynamicColor: false,
    hasModel: true,
    source: `${RIVE_BASE_URL}/mana-2.0.riv`,
  },
  obsidian: {
    dynamicColor: true,
    hasModel: true,
    source: `${RIVE_BASE_URL}/obsidian-2.0.riv`,
  },
  opal: {
    dynamicColor: false,
    hasModel: false,
    source: `${RIVE_BASE_URL}/orb-1.2.riv`,
  },
} as const;

const getCurrentTheme = (): "light" | "dark" => {
  if (typeof window !== "undefined") {
    if (document.documentElement.classList.contains("dark")) {
      return "dark";
    }
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  }
  return "light";
};

const useTheme = (enabled: boolean) => {
  const [theme, setTheme] = useState<"light" | "dark">(getCurrentTheme);

  useEffect(() => {
    // Skip if not enabled (avoids unnecessary observers for non-dynamic-color variants)
    if (!enabled) {
      return;
    }

    const syncFrame = window.requestAnimationFrame(() => {
      setTheme(getCurrentTheme());
    });

    // Watch for classList changes
    const observer = new MutationObserver(() => {
      setTheme(getCurrentTheme());
    });

    observer.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });

    // Watch for OS-level theme changes
    let mql: MediaQueryList | null = null;
    const handleMediaChange = () => {
      setTheme(getCurrentTheme());
    };

    if (window.matchMedia) {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
      mql.addEventListener("change", handleMediaChange);
    }

    return () => {
      window.cancelAnimationFrame(syncFrame);
      observer.disconnect();
      if (mql) {
        mql.removeEventListener("change", handleMediaChange);
      }
    };
  }, [enabled]);

  return theme;
};

const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  return prefersReducedMotion;
};

const useElementVisibility = (
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(Boolean(entry?.isIntersecting));
      },
      { threshold: 0.05 },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [enabled, ref]);

  return enabled ? isVisible : true;
};

interface PersonaWithModelProps {
  rive: ReturnType<typeof useRive>["rive"];
  source: (typeof sources)[keyof typeof sources];
  children: ReactNode;
}

const PersonaWithModel = ({
  rive,
  source,
  children,
}: PersonaWithModelProps) => {
  const theme = useTheme(source.dynamicColor);
  const viewModel = useViewModel(rive, { useDefault: true });
  const viewModelInstance = useViewModelInstance(viewModel, {
    rive,
    useDefault: true,
  });
  const viewModelInstanceColor = useViewModelInstanceColor(
    "color",
    viewModelInstance,
  );

  useEffect(() => {
    if (!(viewModelInstanceColor && source.dynamicColor)) {
      return;
    }

    const [r, g, b] = theme === "dark" ? [255, 255, 255] : [0, 0, 0];
    viewModelInstanceColor.setRgb(r, g, b);
  }, [viewModelInstanceColor, theme, source.dynamicColor]);

  return children;
};

PersonaWithModel.displayName = "PersonaWithModel";

interface PersonaWithoutModelProps {
  rive: ReturnType<typeof useRive>["rive"];
  source: (typeof sources)[keyof typeof sources];
  children: ReactNode;
}

const PersonaWithoutModel = ({ children }: PersonaWithoutModelProps) =>
  children;

PersonaWithoutModel.displayName = "PersonaWithoutModel";

const setBooleanInput = (
  input: ReturnType<typeof useStateMachineInput> | null,
  value: boolean,
) => {
  if (input) {
    input.value = value;
  }
};

/**
 * Renders an animated persona avatar using Rive.
 *
 * @param props - Persona props including state, activation control, and event callbacks.
 * @returns A persona animation component.
 */
export const Persona: FC<PersonaProps> = (props) => {
  const {
    variant = "obsidian",
    isActive = true,
    state = "idle",
    onLoad,
    onLoadError,
    onReady,
    onPause,
    onPlay,
    onStop,
    className,
  } = props;
  const source = sources[variant] ?? sources.obsidian;

  // Stabilize callbacks to prevent useRive from reinitializing
  const callbacksRef = useRef({
    onLoad,
    onLoadError,
    onPause,
    onPlay,
    onReady,
    onStop,
  });

  useEffect(() => {
    callbacksRef.current = {
      onLoad,
      onLoadError,
      onPause,
      onPlay,
      onReady,
      onStop,
    };
  }, [onLoad, onLoadError, onPause, onPlay, onReady, onStop]);

  const [stableCallbacks] = useState(() => ({
    onLoad: ((loadedRive) =>
      callbacksRef.current.onLoad?.(loadedRive)) as NonNullable<
      RiveParameters["onLoad"]
    >,
    onLoadError: ((err) =>
      callbacksRef.current.onLoadError?.(err)) as NonNullable<
      RiveParameters["onLoadError"]
    >,
    onPause: ((event) => callbacksRef.current.onPause?.(event)) as NonNullable<
      RiveParameters["onPause"]
    >,
    onPlay: ((event) => callbacksRef.current.onPlay?.(event)) as NonNullable<
      RiveParameters["onPlay"]
    >,
    onReady: ((_rive: unknown) => {
      callbacksRef.current.onReady?.();
    }) as NonNullable<(rive: unknown) => void>,
    onStop: ((event) => callbacksRef.current.onStop?.(event)) as NonNullable<
      RiveParameters["onStop"]
    >,
  }));

  const prefersReducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const isInViewport = useElementVisibility(
    containerRef,
    isActive && !prefersReducedMotion,
  );
  const shouldAnimate = isActive && isInViewport && !prefersReducedMotion;

  const { rive, RiveComponent } = useRive({
    autoplay: false,
    onLoad: stableCallbacks.onLoad,
    onLoadError: stableCallbacks.onLoadError,
    onPause: stableCallbacks.onPause,
    onPlay: stableCallbacks.onPlay,
    onRiveReady: stableCallbacks.onReady,
    onStop: stableCallbacks.onStop,
    src: source.source,
    stateMachines: stateMachine,
  });

  useEffect(() => {
    if (!rive) {
      return;
    }

    if (!shouldAnimate) {
      rive.pause();
      return;
    }

    rive.play();
  }, [rive, shouldAnimate]);

  const listeningInput = useStateMachineInput(rive, stateMachine, "listening");
  const thinkingInput = useStateMachineInput(rive, stateMachine, "thinking");
  const speakingInput = useStateMachineInput(rive, stateMachine, "speaking");
  const asleepInput = useStateMachineInput(rive, stateMachine, "asleep");

  useEffect(() => {
    setBooleanInput(listeningInput, state === "listening");
    setBooleanInput(thinkingInput, state === "thinking");
    setBooleanInput(speakingInput, state === "speaking");
    setBooleanInput(asleepInput, state === "asleep");
  }, [state, listeningInput, thinkingInput, speakingInput, asleepInput]);

  const Component = source.hasModel ? PersonaWithModel : PersonaWithoutModel;

  return (
    <Component rive={rive} source={source}>
      <div
        aria-label={`AI assistant is ${state}`}
        className={cn("size-16 shrink-0", className)}
        ref={containerRef}
        role="img"
      >
        <RiveComponent className="size-full" />
      </div>
    </Component>
  );
};

Persona.displayName = "Persona";
