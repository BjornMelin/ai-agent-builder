import { type Dispatch, type SetStateAction, useState } from "react";

type HydrationSafeTextElementType = "input" | "select" | "textarea";

type HydrationSafeTextElement =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;

/**
 * Options for reading and storing hydration-safe text input state.
 */
export type HydrationSafeTextStateOptions = Readonly<{
  element: HydrationSafeTextElementType;
  elementId: string;
  fallback: string;
}>;

function isMatchingElement(
  element: Element,
  expectedType: HydrationSafeTextElementType,
): element is HydrationSafeTextElement {
  if (expectedType === "input") {
    return element instanceof HTMLInputElement;
  }
  if (expectedType === "select") {
    return element instanceof HTMLSelectElement;
  }
  return element instanceof HTMLTextAreaElement;
}

/**
 * Reads the current value from an already-rendered form control during hydration.
 *
 * @param options - Lookup options for the target element and fallback.
 * @returns The current DOM value when available; otherwise the fallback value.
 */
export function readHydratedTextValue(
  options: HydrationSafeTextStateOptions,
): string {
  if (typeof window === "undefined") {
    return options.fallback;
  }

  const element = document.getElementById(options.elementId);
  if (!element || !isMatchingElement(element, options.element)) {
    return options.fallback;
  }

  return element.value;
}

/**
 * Creates controlled text state that preserves user-typed input entered before hydration.
 *
 * @param options - Lookup options for the target element and fallback.
 * @returns A state tuple compatible with `useState`.
 */
export function useHydrationSafeTextState(
  options: HydrationSafeTextStateOptions,
): [string, Dispatch<SetStateAction<string>>] {
  return useState(() => readHydratedTextValue(options));
}
