import type { Experimental_GeneratedImage } from "ai";
import NextImage from "next/image";
import { cn } from "@/lib/utils";

export type ImageProps = Experimental_GeneratedImage & {
  className?: string;
  alt?: string;
  height: number;
  width: number;
  sizes?: string;
};

export const Image = ({
  base64,
  uint8Array: _uint8Array,
  mediaType,
  height,
  width,
  sizes,
  ...props
}: ImageProps) => (
  <NextImage
    {...props}
    alt={props.alt ?? "Generated image"}
    className={cn(
      "h-auto max-w-full overflow-hidden rounded-md",
      props.className,
    )}
    height={height}
    sizes={sizes ?? `${width}px`}
    src={`data:${mediaType};base64,${base64}`}
    unoptimized
    width={width}
  />
);
