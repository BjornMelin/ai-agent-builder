"use client";

import type { ThemeProviderProps } from "next-themes";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Application theme provider backed by `next-themes`.
 *
 * @param props - Theme provider props.
 * @returns Theme context provider.
 */
export function ThemeProvider(props: ThemeProviderProps) {
  const { children, ...themeProps } = props;
  return <NextThemesProvider {...themeProps}>{children}</NextThemesProvider>;
}
