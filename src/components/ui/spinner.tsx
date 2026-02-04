import { Loader2Icon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A loading spinner component.
 *
 * @param props - The spinner component properties.
 * @returns - The rendered spinner component.
 */
function Spinner(props: ComponentProps<"svg">) {
  const { className, ...rest } = props;
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...rest}
    />
  );
}

export { Spinner };
