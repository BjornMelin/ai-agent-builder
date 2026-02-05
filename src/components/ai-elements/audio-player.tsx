"use client";

import dynamic from "next/dynamic";

/** Prop types re-exported from the client-only audio player implementation. */
export type {
  AudioPlayerControlBarProps,
  AudioPlayerDurationDisplayProps,
  AudioPlayerElementProps,
  AudioPlayerMuteButtonProps,
  AudioPlayerPlayButtonProps,
  AudioPlayerProps,
  AudioPlayerSeekBackwardButtonProps,
  AudioPlayerSeekForwardButtonProps,
  AudioPlayerTimeDisplayProps,
  AudioPlayerTimeRangeProps,
  AudioPlayerVolumeRangeProps,
} from "./audio-player-inner";

/**
 * Audio player component.
 *
 * @param props - Audio player props.
 * @returns The root audio player controller.
 */
export const AudioPlayer = dynamic<
  import("./audio-player-inner").AudioPlayerProps
>(() => import("./audio-player-inner").then((mod) => mod.AudioPlayer), {
  loading: () => <div aria-hidden="true" className="h-full w-full" />,
  ssr: false,
});

/**
 * Renders the audio media element from direct src or speech result data.
 *
 * @param props - Audio element props with either `src` or encoded speech data.
 * @returns The audio media element from direct src or speech result data.
 */
export const AudioPlayerElement = dynamic<
  import("./audio-player-inner").AudioPlayerElementProps
>(() => import("./audio-player-inner").then((mod) => mod.AudioPlayerElement), {
  loading: () => null,
  ssr: false,
});

/**
 * Renders the player control bar and button group wrapper.
 *
 * @param props - Control bar props.
 * @returns The player control bar and button group wrapper.
 */
export const AudioPlayerControlBar = dynamic<
  import("./audio-player-inner").AudioPlayerControlBarProps
>(
  () => import("./audio-player-inner").then((mod) => mod.AudioPlayerControlBar),
  {
    loading: () => null,
    ssr: false,
  },
);

/**
 * Renders the play/pause control button.
 *
 * @param props - Play button props.
 * @returns The play/pause control button.
 */
export const AudioPlayerPlayButton = dynamic<
  import("./audio-player-inner").AudioPlayerPlayButtonProps
>(
  () => import("./audio-player-inner").then((mod) => mod.AudioPlayerPlayButton),
  {
    loading: () => <button aria-label="Play or pause audio" type="button" />,
    ssr: false,
  },
);

/**
 * Renders the backward seek control.
 *
 * @param props - Seek backward button props.
 * @returns The backward seek control.
 */
export const AudioPlayerSeekBackwardButton = dynamic<
  import("./audio-player-inner").AudioPlayerSeekBackwardButtonProps
>(
  () =>
    import("./audio-player-inner").then(
      (mod) => mod.AudioPlayerSeekBackwardButton,
    ),
  {
    loading: () => <button aria-label="Seek back 10 seconds" type="button" />,
    ssr: false,
  },
);

/**
 * Renders the forward seek control.
 *
 * @param props - Seek forward button props.
 * @returns The forward seek control.
 */
export const AudioPlayerSeekForwardButton = dynamic<
  import("./audio-player-inner").AudioPlayerSeekForwardButtonProps
>(
  () =>
    import("./audio-player-inner").then(
      (mod) => mod.AudioPlayerSeekForwardButton,
    ),
  {
    loading: () => (
      <button aria-label="Seek forward 10 seconds" type="button" />
    ),
    ssr: false,
  },
);

/**
 * Renders the time display component.
 *
 * @param props - Time display props.
 * @returns The elapsed time display.
 */
export const AudioPlayerTimeDisplay = dynamic<
  import("./audio-player-inner").AudioPlayerTimeDisplayProps
>(
  () =>
    import("./audio-player-inner").then((mod) => mod.AudioPlayerTimeDisplay),
  {
    loading: () => null,
    ssr: false,
  },
);

/**
 * Renders the time range component.
 *
 * @param props - Time range props.
 * @returns The elapsed/remaining time range display.
 */
export const AudioPlayerTimeRange = dynamic<
  import("./audio-player-inner").AudioPlayerTimeRangeProps
>(
  () => import("./audio-player-inner").then((mod) => mod.AudioPlayerTimeRange),
  {
    loading: () => null,
    ssr: false,
  },
);

/**
 * Renders the duration display component.
 *
 * @param props - Duration display props.
 * @returns The total duration display.
 */
export const AudioPlayerDurationDisplay = dynamic<
  import("./audio-player-inner").AudioPlayerDurationDisplayProps
>(
  () =>
    import("./audio-player-inner").then(
      (mod) => mod.AudioPlayerDurationDisplay,
    ),
  {
    loading: () => null,
    ssr: false,
  },
);

/**
 * Renders the mute control button.
 *
 * @param props - Mute button props.
 * @returns The mute control button.
 */
export const AudioPlayerMuteButton = dynamic<
  import("./audio-player-inner").AudioPlayerMuteButtonProps
>(
  () => import("./audio-player-inner").then((mod) => mod.AudioPlayerMuteButton),
  {
    loading: () => null,
    ssr: false,
  },
);

/**
 * Renders the volume range control.
 *
 * @param props - Volume range props.
 * @returns The volume range control.
 */
export const AudioPlayerVolumeRange = dynamic<
  import("./audio-player-inner").AudioPlayerVolumeRangeProps
>(
  () =>
    import("./audio-player-inner").then((mod) => mod.AudioPlayerVolumeRange),
  {
    loading: () => null,
    ssr: false,
  },
);
