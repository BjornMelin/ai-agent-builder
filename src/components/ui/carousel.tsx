"use client";

import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Embla API instance exposed to consumers for advanced carousel control. */
type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

type CarouselProps = {
  opts?: CarouselOptions;
  plugins?: CarouselPlugin;
  orientation?: "horizontal" | "vertical";
  setApi?: (api: CarouselApi) => void;
};

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: ReturnType<typeof useEmblaCarousel>[1];
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
} & CarouselProps;

const CarouselContext = React.createContext<CarouselContextProps | null>(null);

/**
 * Returns the carousel context.
 *
 * @returns The carousel context used by child components.
 * @throws {Error} If used outside a `<Carousel />` provider.
 */
function useCarousel() {
  const context = React.useContext(CarouselContext);

  if (!context) {
    throw new Error("useCarousel must be used within a <Carousel />");
  }

  return context;
}

/**
 * Creates an Embla-backed carousel section with keyboard navigation and shared context.
 *
 * @param props - Section props plus carousel options, plugins, orientation, and optional API callback.
 * @returns The carousel provider and root section used by carousel subcomponents.
 */
function Carousel(props: React.ComponentProps<"section"> & CarouselProps) {
  const {
    orientation = "horizontal",
    opts,
    setApi,
    plugins,
    className,
    children,
    ...rest
  } = props;

  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === "horizontal" ? "x" : "y",
    },
    plugins,
  );
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  const scrollPrev = () => {
    api?.scrollPrev();
  };

  const scrollNext = () => {
    api?.scrollNext();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (orientation === "vertical") {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        scrollNext();
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollPrev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollNext();
    }
  };

  React.useEffect(() => {
    if (!api || !setApi) return;
    setApi(api);
  }, [api, setApi]);

  React.useEffect(() => {
    if (!api) return;
    const onSelect = (nextApi: CarouselApi) => {
      if (!nextApi) return;
      setCanScrollPrev(nextApi.canScrollPrev());
      setCanScrollNext(nextApi.canScrollNext());
    };

    onSelect(api);
    api.on("reInit", onSelect);
    api.on("select", onSelect);

    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  return (
    <CarouselContext.Provider
      value={{
        api: api,
        canScrollNext,
        canScrollPrev,
        carouselRef,
        opts,
        orientation:
          orientation || (opts?.axis === "y" ? "vertical" : "horizontal"),
        scrollNext,
        scrollPrev,
      }}
    >
      <section
        onKeyDownCapture={handleKeyDown}
        className={cn("relative", className)}
        data-slot="carousel"
        {...rest}
      >
        {children}
      </section>
    </CarouselContext.Provider>
  );
}

/**
 * Renders the scrollable track container that Embla uses as the slide viewport.
 *
 * @param props - Div props forwarded to the inner track element.
 * @returns A viewport wrapper with an orientation-aware track.
 */
function CarouselContent(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  const { carouselRef, orientation } = useCarousel();

  return (
    <div
      ref={carouselRef}
      className="overflow-hidden"
      data-slot="carousel-content"
    >
      <div
        className={cn(
          "flex",
          orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
          className,
        )}
        {...rest}
      />
    </div>
  );
}

/**
 * Renders a single slide item within the carousel track.
 *
 * @param props - Div props forwarded to the slide container.
 * @returns A flex-basis slide container with orientation-aware spacing.
 */
function CarouselItem(props: React.ComponentProps<"div">) {
  const { className, ...rest } = props;

  const { orientation } = useCarousel();

  return (
    <div
      data-slot="carousel-item"
      className={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation === "horizontal" ? "pl-4" : "pt-4",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Renders the previous-slide control button.
 *
 * @param props - Button props for the previous control.
 * @returns A positioned control button bound to carousel previous navigation.
 */
function CarouselPrevious(props: React.ComponentProps<typeof Button>) {
  const { className, variant = "outline", size = "icon", ...rest } = props;

  const { orientation, scrollPrev, canScrollPrev } = useCarousel();

  return (
    <Button
      data-slot="carousel-previous"
      variant={variant}
      size={size}
      className={cn(
        "absolute size-8 rounded-full",
        orientation === "horizontal"
          ? "top-1/2 -left-12 -translate-y-1/2"
          : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
        className,
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...rest}
    >
      <ArrowLeft aria-hidden="true" />
      <span className="sr-only">Previous slide</span>
    </Button>
  );
}

/**
 * Renders the next-slide control button.
 *
 * @param props - Button props for the next control.
 * @returns A positioned control button bound to carousel next navigation.
 */
function CarouselNext(props: React.ComponentProps<typeof Button>) {
  const { className, variant = "outline", size = "icon", ...rest } = props;

  const { orientation, scrollNext, canScrollNext } = useCarousel();

  return (
    <Button
      data-slot="carousel-next"
      variant={variant}
      size={size}
      className={cn(
        "absolute size-8 rounded-full",
        orientation === "horizontal"
          ? "top-1/2 -right-12 -translate-y-1/2"
          : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
        className,
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...rest}
    >
      <ArrowRight aria-hidden="true" />
      <span className="sr-only">Next slide</span>
    </Button>
  );
}

export {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
};
