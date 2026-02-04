import type { Experimental_GeneratedImage } from "ai";
import NextImage from "next/image";
import { cn } from "@/lib/utils";

/** Props for the Image component. */
export type ImageProps = Experimental_GeneratedImage & {
  className?: string;
  alt?: string;
  height: number;
  width: number;
  sizes?: string;
};

/**
 * Renders an AI-generated image using data URL sources.
 *
 * @param props - Image props including base64 data and dimensions.
 * @returns A Next.js image element for the generated image.
 */
export const Image = (props: ImageProps) => {
  const {
    base64,
    uint8Array: _uint8Array,
    mediaType,
    height,
    width,
    sizes,
    className,
    alt,
    ...rest
  } = props;

  return (
    <NextImage
      {...rest}
      alt={alt ?? "Generated image"}
      className={cn("h-auto max-w-full overflow-hidden rounded-md", className)}
      height={height}
      sizes={sizes ?? `${width}px`}
      src={`data:${mediaType};base64,${base64}`}
      unoptimized
      width={width}
    />
  );
};
