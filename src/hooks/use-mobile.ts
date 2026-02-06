import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Tracks whether the viewport width is below the mobile breakpoint.
 *
 * @returns `true` when the viewport is considered mobile.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    mql.addEventListener("change", onChange);
    setIsMobile(mql.matches);

    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  return Boolean(isMobile);
}
