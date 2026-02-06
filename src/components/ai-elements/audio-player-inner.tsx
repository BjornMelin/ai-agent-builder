"use client";

import type { Experimental_SpeechResult as SpeechResult } from "ai";
import {
  MediaControlBar,
  MediaController,
  MediaDurationDisplay,
  MediaMuteButton,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";
import type { ComponentProps, CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";

/** Props for the AudioPlayer component. */
export type AudioPlayerProps = Omit<
  ComponentProps<typeof MediaController>,
  "audio"
>;

/**
 * Renders the root audio player controller.
 *
 * @param props - Media controller props.
 * @returns The audio player root element.
 */
export const AudioPlayer = (props: AudioPlayerProps) => {
  const { className, children, style, ...rest } = props;
  return (
    <MediaController
      audio
      className={className}
      data-slot="audio-player"
      style={
        {
          "--media-background-color": "transparent",
          "--media-button-icon-height": "1rem",
          "--media-button-icon-width": "1rem",
          "--media-control-background": "transparent",
          "--media-control-hover-background": "var(--color-accent)",
          "--media-control-padding": "0",
          "--media-font": "var(--font-sans)",
          "--media-font-size": "10px",
          "--media-icon-color": "currentColor",
          "--media-preview-time-background": "var(--color-background)",
          "--media-preview-time-border-radius": "var(--radius-md)",
          "--media-preview-time-text-shadow": "none",
          "--media-primary-color": "var(--color-primary)",
          "--media-range-bar-color": "var(--color-primary)",
          "--media-range-track-background": "var(--color-secondary)",
          "--media-secondary-color": "var(--color-secondary)",
          "--media-text-color": "var(--color-foreground)",
          "--media-tooltip-arrow-display": "none",
          "--media-tooltip-background": "var(--color-background)",
          "--media-tooltip-border-radius": "var(--radius-md)",
          ...style,
        } as CSSProperties
      }
      {...rest}
    >
      {children}
    </MediaController>
  );
};

type AudioPlayerElementBaseProps = Omit<ComponentProps<"audio">, "src">;
/** Props for `AudioPlayerElement` supporting src or speech-result audio data. */
export type AudioPlayerElementProps =
  | (AudioPlayerElementBaseProps & {
      data: SpeechResult["audio"];
      src?: never;
    })
  | (AudioPlayerElementBaseProps & {
      src: string;
      data?: never;
    });

/**
 * Renders the audio media element from direct src or speech result data.
 *
 * @param props - Audio element props with either `src` or encoded speech data.
 * @returns The audio media element.
 */
export const AudioPlayerElement = (props: AudioPlayerElementProps) => {
  if ("src" in props && "data" in props) {
    if (process.env.NODE_ENV !== "production") {
      console.error(
        "[AudioPlayerElement] `src` and `data` are mutually exclusive props.",
      );
    }
    return null;
  }

  if ("src" in props) {
    const { src, ...audioProps } = props;
    return (
      <audio
        data-slot="audio-player-element"
        slot="media"
        src={src}
        {...audioProps}
      />
    );
  }

  const { data, ...audioProps } = props;
  if (
    typeof data?.mediaType !== "string" ||
    data.mediaType.length === 0 ||
    typeof data?.base64 !== "string" ||
    data.base64.length === 0
  ) {
    if (process.env.NODE_ENV !== "production") {
      console.error(
        "[AudioPlayerElement] Invalid `data` payload; expected non-empty `mediaType` and `base64`.",
      );
    }
    return null;
  }
  const src = `data:${data.mediaType};base64,${data.base64}`;

  return (
    <audio
      data-slot="audio-player-element"
      slot="media"
      src={src}
      {...audioProps}
    />
  );
};

/** Props for the AudioPlayerControlBar component. */
export type AudioPlayerControlBarProps = ComponentProps<typeof MediaControlBar>;

/**
 * Renders the player control bar and button group wrapper.
 *
 * @param props - Control bar props.
 * @returns The control bar wrapper.
 */
export const AudioPlayerControlBar = (props: AudioPlayerControlBarProps) => {
  const { children, ...rest } = props;
  return (
    <MediaControlBar data-slot="audio-player-control-bar" {...rest}>
      <ButtonGroup orientation="horizontal">{children}</ButtonGroup>
    </MediaControlBar>
  );
};

/** Props for the AudioPlayerPlayButton component. */
export type AudioPlayerPlayButtonProps = ComponentProps<typeof MediaPlayButton>;

/**
 * Renders the play/pause control button.
 *
 * @param props - Play button props.
 * @returns The play button component.
 */
export const AudioPlayerPlayButton = (props: AudioPlayerPlayButtonProps) => {
  const { className, "aria-label": ariaLabel, ...rest } = props;
  return (
    <Button asChild size="icon-sm" variant="outline">
      <MediaPlayButton
        aria-label={ariaLabel ?? "Play or pause audio"}
        className={cn("bg-transparent", className)}
        data-slot="audio-player-play-button"
        {...rest}
      />
    </Button>
  );
};

/** Props for the AudioPlayerSeekBackwardButton component. */
export type AudioPlayerSeekBackwardButtonProps = ComponentProps<
  typeof MediaSeekBackwardButton
>;

/**
 * Renders the backward seek control.
 *
 * @param props - Seek backward button props.
 * @returns The seek backward button.
 */
export const AudioPlayerSeekBackwardButton = (
  props: AudioPlayerSeekBackwardButtonProps,
) => {
  const { seekOffset = 10, "aria-label": ariaLabel, ...rest } = props;
  return (
    <Button asChild size="icon-sm" variant="outline">
      <MediaSeekBackwardButton
        aria-label={ariaLabel ?? `Seek back ${seekOffset} seconds`}
        data-slot="audio-player-seek-backward-button"
        seekOffset={seekOffset}
        {...rest}
      />
    </Button>
  );
};

/** Props for the AudioPlayerSeekForwardButton component. */
export type AudioPlayerSeekForwardButtonProps = ComponentProps<
  typeof MediaSeekForwardButton
>;

/**
 * Renders the forward seek control.
 *
 * @param props - Seek forward button props.
 * @returns The seek forward button.
 */
export const AudioPlayerSeekForwardButton = (
  props: AudioPlayerSeekForwardButtonProps,
) => {
  const { seekOffset = 10, "aria-label": ariaLabel, ...rest } = props;
  return (
    <Button asChild size="icon-sm" variant="outline">
      <MediaSeekForwardButton
        aria-label={ariaLabel ?? `Seek forward ${seekOffset} seconds`}
        data-slot="audio-player-seek-forward-button"
        seekOffset={seekOffset}
        {...rest}
      />
    </Button>
  );
};

/** Props for the AudioPlayerTimeDisplay component. */
export type AudioPlayerTimeDisplayProps = ComponentProps<
  typeof MediaTimeDisplay
>;

/**
 * Renders elapsed playback time.
 *
 * @param props - Time display props.
 * @returns The elapsed time display.
 */
export const AudioPlayerTimeDisplay = (props: AudioPlayerTimeDisplayProps) => {
  const { className, ...rest } = props;
  return (
    <ButtonGroupText asChild className="bg-transparent">
      <MediaTimeDisplay
        className={cn("tabular-nums", className)}
        data-slot="audio-player-time-display"
        {...rest}
      />
    </ButtonGroupText>
  );
};

/** Props for the AudioPlayerTimeRange component. */
export type AudioPlayerTimeRangeProps = ComponentProps<typeof MediaTimeRange>;

/**
 * Renders the seekable timeline range.
 *
 * @param props - Time range props.
 * @returns The timeline range control.
 */
export const AudioPlayerTimeRange = (props: AudioPlayerTimeRangeProps) => {
  const { className, ...rest } = props;
  return (
    <ButtonGroupText asChild className="bg-transparent">
      <MediaTimeRange
        className={className}
        data-slot="audio-player-time-range"
        {...rest}
      />
    </ButtonGroupText>
  );
};

/** Props for the AudioPlayerDurationDisplay component. */
export type AudioPlayerDurationDisplayProps = ComponentProps<
  typeof MediaDurationDisplay
>;

/**
 * Renders total media duration.
 *
 * @param props - Duration display props.
 * @returns The total duration display.
 */
export const AudioPlayerDurationDisplay = (
  props: AudioPlayerDurationDisplayProps,
) => {
  const { className, ...rest } = props;
  return (
    <ButtonGroupText asChild className="bg-transparent">
      <MediaDurationDisplay
        className={cn("tabular-nums", className)}
        data-slot="audio-player-duration-display"
        {...rest}
      />
    </ButtonGroupText>
  );
};

/** Props for the AudioPlayerMuteButton component. */
export type AudioPlayerMuteButtonProps = ComponentProps<typeof MediaMuteButton>;

/**
 * Renders the mute toggle button.
 *
 * @param props - Mute button props.
 * @returns The mute toggle button.
 */
export const AudioPlayerMuteButton = (props: AudioPlayerMuteButtonProps) => {
  const { className, ...rest } = props;
  return (
    <ButtonGroupText asChild className="bg-transparent">
      <MediaMuteButton
        aria-label={rest["aria-label"] ?? "Mute or unmute audio"}
        className={className}
        data-slot="audio-player-mute-button"
        {...rest}
      />
    </ButtonGroupText>
  );
};

/** Props for the AudioPlayerVolumeRange component. */
export type AudioPlayerVolumeRangeProps = ComponentProps<
  typeof MediaVolumeRange
>;

/**
 * Renders the volume range control.
 *
 * @param props - Volume range props.
 * @returns The volume range control.
 */
export const AudioPlayerVolumeRange = (props: AudioPlayerVolumeRangeProps) => {
  const { className, ...rest } = props;
  return (
    <ButtonGroupText asChild className="bg-transparent">
      <MediaVolumeRange
        className={className}
        data-slot="audio-player-volume-range"
        {...rest}
      />
    </ButtonGroupText>
  );
};
