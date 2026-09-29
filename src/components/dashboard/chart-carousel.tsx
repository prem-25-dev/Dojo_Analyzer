"use client";

import { ChevronLeft, ChevronRight, Table2, BarChart3 } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { DataTable, type TableData } from "@/components/dashboard/chart-kit";

export type Slide = {
  key: string;
  title: string;
  subtitle: string;
  controls?: ReactNode;
  legend?: ReactNode;
  chart: ReactNode;
  table: TableData;
};

/** One chart at a time: tabs to jump, arrows/keys to step, chart or table view. */
export function ChartCarousel({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<"chart" | "table">("chart");
  const current = slides[Math.min(index, slides.length - 1)];

  function go(next: number) {
    setIndex((next + slides.length) % slides.length);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if ((event.target as HTMLElement).tagName === "SELECT") return;
    if (event.key === "ArrowRight") go(index + 1);
    if (event.key === "ArrowLeft") go(index - 1);
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Dashboard charts"
      onKeyDown={onKeyDown}
      className="rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)]"
    >
      {/* Slide tabs */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
        <div
          role="tablist"
          aria-label="Charts"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
        >
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.key}
              type="button"
              role="tab"
              aria-selected={slideIndex === index}
              onClick={() => setIndex(slideIndex)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 font-display text-[13px] font-semibold tracking-[-0.01em] transition-colors ${
                slideIndex === index
                  ? "bg-ink/[0.055] text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {slide.title}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous chart"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition hover:bg-ink/5"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next chart"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition hover:bg-ink/5"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {/* Header for the current slide */}
      <div className="flex flex-col gap-3 px-5 pt-5 lg:flex-row lg:items-start lg:justify-between lg:px-6">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink">
            {current.title}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">{current.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {current.controls}
          <div
            role="group"
            aria-label="Chart or table"
            className="flex rounded-lg bg-ink/[0.045] p-0.5"
          >
            {(["chart", "table"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                aria-label={option === "chart" ? "Chart view" : "Table view"}
                onClick={() => setView(option)}
                className={`flex h-7 w-8 items-center justify-center rounded-md transition ${
                  view === option
                    ? "bg-surface text-ink shadow-[var(--card-shadow)] ring-[0.5px] ring-line"
                    : "text-muted hover:text-ink"
                }`}
              >
                {option === "chart" ? (
                  <BarChart3 size={15} />
                ) : (
                  <Table2 size={15} />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Slides */}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((slide, slideIndex) => (
            <div
              key={slide.key}
              role="tabpanel"
              aria-roledescription="slide"
              aria-label={`${slideIndex + 1} of ${slides.length}: ${slide.title}`}
              aria-hidden={slideIndex !== index}
              inert={slideIndex !== index}
              className="w-full shrink-0 px-5 pb-5 pt-4 lg:px-6"
            >
              {slide.legend && view === "chart" && (
                <div className="mb-3">{slide.legend}</div>
              )}
              {view === "chart" ? (
                slide.chart
              ) : (
                <DataTable table={slide.table} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-1.5 pb-4">
        {slides.map((slide, slideIndex) => (
          <button
            key={slide.key}
            type="button"
            onClick={() => setIndex(slideIndex)}
            aria-label={`Show ${slide.title}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              slideIndex === index
                ? "w-5 bg-ink"
                : "w-1.5 bg-line-strong hover:bg-faint"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
