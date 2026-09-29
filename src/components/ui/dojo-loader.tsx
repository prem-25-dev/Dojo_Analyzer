"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useEffect, useState } from "react";

const BELTS = [
  "var(--lang-cpp)",
  "var(--lang-java)",
  "var(--lang-nodejs)",
  "var(--lang-python)",
];

const DEFAULT_LINES = [
  "Tying belts",
  "Counting promotions",
  "Warming up the dojo",
  "Lining up the squads",
];

function clean(label: string) {
  return label.replace(/(\.\.\.|…)$/, "");
}

/** Cycles through captions every couple of seconds. */
function useCaption(lines: string[]) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % lines.length),
      1800,
    );
    return () => window.clearInterval(timer);
  }, [lines.length]);
  return lines[index % lines.length];
}

/**
 * Branded loading mark: the Kalvium badge inside a spinning ember ring, four
 * belt stripes (one per language) that fill in turn, and a rotating caption.
 * It fades in after a short delay, so quick loads never flash it.
 */
export function DojoLoader({
  label,
  lines,
  compact = false,
  tone = "auto",
}: {
  label?: string;
  lines?: string[];
  compact?: boolean;
  /** "dark" forces light-on-dark colours for dark stages like the leaderboard. */
  tone?: "auto" | "dark";
}) {
  const captions = lines ?? (label ? [clean(label), ...DEFAULT_LINES.slice(0, 2)] : DEFAULT_LINES);
  const caption = useCaption(captions);
  const badge = compact ? 40 : 56;
  const ink = tone === "dark" ? "text-white/80" : "text-ink-2";
  const track = tone === "dark" ? "bg-white/10" : "bg-sunken";

  return (
    <div
      role="status"
      aria-live="polite"
      className="dojo-loader flex flex-col items-center"
    >
      <div
        className="relative grid place-items-center"
        style={{ width: badge + 20, height: badge + 20 }}
      >
        <span
          aria-hidden="true"
          className="dojo-anim absolute inset-0 animate-[spin_1.4s_linear_infinite] rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0 55%, color-mix(in srgb, var(--brand) 25%, transparent) 70%, var(--brand) 100%)",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 2.5px))",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 2.5px))",
          }}
        />
        <span
          aria-hidden="true"
          className="dojo-anim absolute inset-2 animate-[dojo-breathe_2.4s_ease-in-out_infinite] rounded-2xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--brand) 28%, transparent), transparent 70%)",
          }}
        />
        <Image
          src="/imgs/kalvium_icon.jpg"
          alt=""
          width={badge}
          height={badge}
          className="relative rounded-2xl shadow-[0_10px_30px_-12px_rgba(239,56,55,0.6)]"
          style={{ width: badge - 16, height: badge - 16 }}
        />
      </div>

      <div
        aria-hidden="true"
        className={`flex gap-1.5 ${compact ? "mt-3" : "mt-5"}`}
      >
        {BELTS.map((color, index) => (
          <span
            key={color}
            className={`relative h-1.5 overflow-hidden rounded-full ${track} ${compact ? "w-6" : "w-9"}`}
          >
            <span
              className="dojo-anim absolute inset-0 origin-left rounded-full"
              style={{
                background: color,
                animation: `dojo-belt-fill 2s ${index * 0.22}s cubic-bezier(0.65,0,0.35,1) infinite`,
              }}
            />
          </span>
        ))}
      </div>

      <div
        className={`relative h-5 overflow-hidden text-center ${compact ? "mt-2.5 w-56" : "mt-4 w-72"}`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={caption}
            initial={{ y: 14, opacity: 0, filter: "blur(4px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: -14, opacity: 0, filter: "blur(4px)" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute inset-x-0 font-display text-[13.5px] font-semibold tracking-[-0.01em] ${ink}`}
          >
            {caption}
            <span aria-hidden="true" className="ml-0.5 inline-flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="status-dot inline-block h-1 w-1 rounded-full bg-current"
                  style={{
                    animation: `status-dot 1.2s ${i * 0.15}s ease-in-out infinite`,
                  }}
                />
              ))}
            </span>
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
