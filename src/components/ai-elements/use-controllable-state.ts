import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

/**
 * Parameters for `useControllableState`.
 *
 * @typeParam T - The value type for the controlled/uncontrolled state.
 */
export type UseControllableStateParams<T> = {
  /** Controlled value from parent state. */
  prop: T | undefined;
  /** Initial value for uncontrolled mode. */
  defaultProp: T;
  /** Callback fired when the resolved value changes. */
  onChange?: (value: T) => void;
};

/**
 * Supports controlled and uncontrolled state from a single hook.
 *
 * @typeParam T - The value type for the controlled/uncontrolled state.
 * @param params - Controlled/uncontrolled state options.
 * @returns Current value and a setter matching `useState` behavior.
 */
export function useControllableState<T>(
  params: UseControllableStateParams<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const { prop, defaultProp, onChange } = params;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultProp);
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : uncontrolledValue;

  const setValue: Dispatch<SetStateAction<T>> = (nextValueOrUpdater) => {
    if (isControlled) {
      const nextValue =
        typeof nextValueOrUpdater === "function"
          ? (nextValueOrUpdater as (previous: T) => T)(value)
          : nextValueOrUpdater;

      if (!Object.is(nextValue, value)) {
        onChange?.(nextValue);
      }
      return;
    }

    setUncontrolledValue((previous) => {
      const nextValue =
        typeof nextValueOrUpdater === "function"
          ? (nextValueOrUpdater as (value: T) => T)(previous)
          : nextValueOrUpdater;

      if (!Object.is(nextValue, previous)) {
        onChange?.(nextValue);
      }

      return nextValue;
    });
  };

  return [value, setValue];
}
