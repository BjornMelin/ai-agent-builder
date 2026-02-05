"use client";

import dynamic from "next/dynamic";
import type { PersonaProps } from "./persona-inner";

/** State values emitted by the persona animation controller. */
export type { PersonaState } from "./persona-inner";

/**
 * Lazily load the Persona animation to keep Rive out of the main bundle.
 */
export const Persona = dynamic<PersonaProps>(
  () => import("./persona-inner").then((mod) => mod.Persona),
  {
    loading: () => <div aria-hidden="true" className="h-full w-full" />,
    ssr: false,
  },
);
