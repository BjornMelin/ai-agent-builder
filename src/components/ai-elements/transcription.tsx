"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import type { Experimental_TranscriptionResult as TranscriptionResult } from "ai";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

type TranscriptionSegmentData = TranscriptionResult["segments"][number];

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

export type TranscriptionProps = Omit<ComponentProps<"div">, "children"> & {
  segments: TranscriptionSegmentData[];
  currentTime?: number;
  onSeek?: (time: number) => void;
  children: (segment: TranscriptionSegmentData, index: number) => ReactNode;
};

export const Transcription = ({
  segments,
  currentTime: externalCurrentTime,
  onSeek,
  className,
  children,
  ...props
}: TranscriptionProps) => {
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
        {...props}
      >
        {segments
          .filter((segment) => segment.text.trim())
          .map((segment, index) => children(segment, index))}
      </div>
    </TranscriptionContext.Provider>
  );
};

export type TranscriptionSegmentProps = ComponentProps<"button"> & {
  segment: TranscriptionSegmentData;
  index: number;
};

export const TranscriptionSegment = ({
  segment,
  index,
  className,
  onClick,
  ...props
}: TranscriptionSegmentProps) => {
  const { currentTime, onSeek } = useTranscription();

  const isActive =
    currentTime >= segment.startSecond && currentTime < segment.endSecond;
  const isPast = currentTime >= segment.endSecond;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (onSeek) {
      onSeek(segment.startSecond);
    }
    onClick?.(event);
  };

  return (
    <button
      className={cn(
        "inline text-left",
        isActive && "text-primary",
        isPast && "text-muted-foreground",
        !(isActive || isPast) && "text-muted-foreground/60",
        onSeek && "cursor-pointer hover:text-foreground",
        !onSeek && "cursor-default",
        className,
      )}
      data-active={isActive}
      data-index={index}
      data-slot="transcription-segment"
      onClick={handleClick}
      type="button"
      {...props}
    >
      {segment.text}
    </button>
  );
};
