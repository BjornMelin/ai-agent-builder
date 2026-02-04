"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

interface TranscriptionSegmentData {
  text: string;
  startSecond: number;
  endSecond: number;
}

interface TranscriptionContextValue {
  segments: TranscriptionSegmentData[];
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onSeek?: (time: number) => void;
}

const TranscriptionContext = createContext<TranscriptionContextValue | null>(
  null,
);

const useTranscription = () => {
  const context = useContext(TranscriptionContext);
  if (!context) {
    throw new Error(
      "Transcription components must be used within Transcription",
    );
  }
  return context;
};

/** Props for rendering and controlling an interactive transcription timeline. */
export type TranscriptionProps = Omit<ComponentProps<"div">, "children"> & {
  segments: TranscriptionSegmentData[];
  currentTime?: number;
  onSeek?: (time: number) => void;
  children: (segment: TranscriptionSegmentData, index: number) => ReactNode;
};

/**
 * Renders a segmented transcription with time-aware highlighting.
 *
 * @param props - Transcription props including segments and time handlers.
 * @returns A transcription container element.
 */
export const Transcription = (props: TranscriptionProps) => {
  const {
    segments,
    currentTime: externalCurrentTime,
    onSeek,
    className,
    children,
    ...rest
  } = props;
  const [currentTime, setCurrentTime] = useControllableState({
    defaultProp: 0,
    prop: externalCurrentTime,
    ...(onSeek === undefined ? {} : { onChange: onSeek }),
  });

  return (
    <TranscriptionContext.Provider
      value={{
        currentTime,
        onTimeUpdate: setCurrentTime,
        segments,
        ...(onSeek === undefined ? {} : { onSeek }),
      }}
    >
      <div
        className={cn(
          "flex flex-wrap gap-1 text-sm leading-relaxed",
          className,
        )}
        data-slot="transcription"
        {...rest}
      >
        {segments
          .map((segment, index) => ({ index, segment }))
          .filter(({ segment }) => segment.text.trim())
          .map(({ segment, index }) => children(segment, index))}
      </div>
    </TranscriptionContext.Provider>
  );
};

/** Props for a single timed transcription segment token. */
export type TranscriptionSegmentProps = ComponentProps<"button"> & {
  segment: TranscriptionSegmentData;
  index: number;
};

/**
 * Renders a clickable transcription segment.
 *
 * @param props - Segment props including segment data and index.
 * @returns A transcription segment button element.
 */
export const TranscriptionSegment = (props: TranscriptionSegmentProps) => {
  const { segment, index, className, onClick, ...rest } = props;
  const { currentTime, onSeek } = useTranscription();

  const isActive =
    currentTime >= segment.startSecond && currentTime < segment.endSecond;
  const isPast = currentTime >= segment.endSecond;

  if (!onSeek) {
    return (
      <span
        className={cn(
          "inline text-left",
          isActive && "text-primary",
          isPast && "text-muted-foreground",
          !(isActive || isPast) && "text-muted-foreground/60",
          className,
        )}
        data-active={isActive}
        data-index={index}
        data-slot="transcription-segment"
        {...rest}
      >
        {segment.text}
      </span>
    );
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onSeek(segment.startSecond);
    onClick?.(event);
  };

  return (
    <button
      className={cn(
        "inline cursor-pointer rounded-sm text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive && "text-primary",
        isPast && "text-muted-foreground",
        !(isActive || isPast) && "text-muted-foreground/60",
        className,
      )}
      data-active={isActive}
      data-index={index}
      data-slot="transcription-segment"
      onClick={handleClick}
      type="button"
      {...rest}
    >
      {segment.text}
    </button>
  );
};
