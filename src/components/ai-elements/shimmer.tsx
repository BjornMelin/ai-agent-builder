"use client";

import { motion } from "motion/react";
import { type ElementType, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Props for the Shimmer component. */
export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => {
  const dynamicSpread = (children?.length ?? 0) * spread;
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updatePreference);
      return () => {
        mediaQuery.removeEventListener("change", updatePreference);
      };
    }
  }, []);

  const style = {
    "--spread": `${dynamicSpread}px`,
    backgroundImage:
      "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
  } as unknown as import("motion/react").MotionStyle;

  const Wrapper = Component;

  return (
    <Wrapper>
      <motion.span
        animate={
          prefersReducedMotion
            ? { backgroundPosition: "100% center" }
            : { backgroundPosition: "0% center" }
        }
        className={cn(
          "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
          "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
          className,
        )}
        initial={{ backgroundPosition: "100% center" }}
        style={style}
        {...(prefersReducedMotion
          ? {}
          : {
              transition: {
                duration,
                ease: "linear" as const,
                repeat: Number.POSITIVE_INFINITY,
              },
            })}
      >
        {children}
      </motion.span>
    </Wrapper>
  );
};

/**
 * Animated text shimmer effect for loading or emphasis states.
 */
export const Shimmer = ShimmerComponent;
