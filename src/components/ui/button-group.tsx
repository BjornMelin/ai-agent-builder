import { Slot as SlotPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/** Shared style variants for grouped button layouts. */
const buttonGroupVariants = cva(
  "flex w-fit items-stretch [&>*]:focus-visible:z-10 [&>*]:focus-visible:relative [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md has-[>[data-slot=button-group]]:gap-2",
  {
    defaultVariants: {
      orientation: "horizontal",
    },
    variants: {
      orientation: {
        horizontal:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none",
        vertical:
          "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none",
      },
    },
  },
);

/**
 * Groups related controls into a single segmented fieldset.
 *
 * @param props - Fieldset props plus `orientation` controlling horizontal or vertical segmentation.
 * @returns A segmented fieldset container for grouped controls.
 */
function ButtonGroup(
  props: ComponentProps<"fieldset"> & VariantProps<typeof buttonGroupVariants>,
) {
  const { className, orientation, ...rest } = props;

  return (
    <fieldset
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(
        "m-0 min-w-0 border-0 p-0",
        buttonGroupVariants({ orientation }),
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders static text content aligned with button-group controls.
 *
 * @param props - Text container props with optional slot rendering via `asChild`.
 * @returns A styled text container that matches grouped control chrome.
 */
function ButtonGroupText(
  props: ComponentProps<"div"> & {
    asChild?: boolean;
  },
) {
  const { className, asChild = false, ...rest } = props;

  const Comp = asChild ? SlotPrimitive.Slot : "div";

  return (
    <Comp
      className={cn(
        "bg-muted flex items-center gap-2 rounded-md border px-4 text-sm font-medium shadow-xs [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders a visual separator between grouped controls.
 *
 * @param props - Separator props including optional orientation.
 * @returns A separator tuned for button-group spacing and borders.
 */
function ButtonGroupSeparator(props: ComponentProps<typeof Separator>) {
  const { className, orientation = "vertical", ...rest } = props;

  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(
        "bg-input relative !m-0 self-stretch data-[orientation=vertical]:h-auto",
        className,
      )}
      {...rest}
    />
  );
}

export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
};
