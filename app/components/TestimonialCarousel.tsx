"use client";

import { useEffect, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import type { TestimonialRow } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

const FALLBACK: TestimonialRow[] = [
  {
    id: "fallback-1",
    firm_type: "Mid-market multifamily fund",
    persona: "Principal",
    quote:
      "We had blind spots on regional exposure. CRE Signal gave us a single risk language across deals — IC stopped debating definitions and started debating capital.",
    attribution: "Principal, multifamily fund",
    deal_context: "Sunbelt acquisition pipeline",
    sort_order: 0,
  },
];

type Props = {
  testimonials: TestimonialRow[];
  className?: string;
  /** Smaller typography and padding for /pricing embed */
  compact?: boolean;
};

export default function TestimonialCarousel({ testimonials, className, compact }: Props) {
  const items = testimonials.length > 0 ? testimonials : FALLBACK;
  const [api, setApi] = useState<CarouselApi>();

  useEffect(() => {
    if (!api) return;
    const id = window.setInterval(() => {
      api.scrollNext();
    }, 8000);
    return () => window.clearInterval(id);
  }, [api]);

  return (
    <section
      className={cn("w-full", className)}
      aria-label="Customer testimonials"
    >
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: "start" }}
        className="mx-auto w-full max-w-3xl"
      >
        <CarouselContent className="-ml-2 md:-ml-4">
          {items.map((t) => (
            <CarouselItem key={t.id} className="pl-2 md:basis-full md:pl-4">
              <blockquote
                className={cn(
                  "rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-6 text-left shadow-sm ring-1 ring-white/5 backdrop-blur-sm",
                  compact && "p-4 md:p-5"
                )}
              >
                <p
                  className={cn(
                    "text-zinc-100 leading-relaxed",
                    compact ? "text-sm md:text-[15px]" : "text-base md:text-lg"
                  )}
                >
                  “{t.quote}”
                </p>
                <footer className="mt-4 space-y-1 border-t border-zinc-700/80 pt-4 text-sm text-zinc-400">
                  {t.attribution && <cite className="not-italic font-medium">{t.attribution}</cite>}
                  {t.firm_type && (
                    <p className="m-0 text-xs uppercase tracking-wide text-zinc-500">{t.firm_type}</p>
                  )}
                  {t.deal_context && <p className="m-0 text-xs text-zinc-500">{t.deal_context}</p>}
                </footer>
              </blockquote>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious
          className="left-0 border-zinc-600 bg-zinc-900/90 text-zinc-200 hover:bg-zinc-800 md:-left-2"
          variant="outline"
        />
        <CarouselNext
          className="right-0 border-zinc-600 bg-zinc-900/90 text-zinc-200 hover:bg-zinc-800 md:-right-2"
          variant="outline"
        />
      </Carousel>
    </section>
  );
}
