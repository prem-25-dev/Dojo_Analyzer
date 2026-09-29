"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { BELT_LADDER, BELT_SLOTS, beltFill, beltOf } from "@/lib/belts";
import { LANGUAGE_LABELS, type Language } from "@/lib/dashboard/metrics";

const LOGOS: Record<Language, string> = {
  cpp: "/imgs/lang/cpp.png",
  java: "/imgs/lang/java.png",
  nodejs: "/imgs/lang/nodejs.png",
  python: "/imgs/lang/python.png",
};

/** The language's own logo, used in place of a colour swatch. */
export function LanguageLogo({
  language,
  size = 18,
  className = "",
}: {
  language: Language;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={LOGOS[language]}
      alt={LANGUAGE_LABELS[language]}
      title={LANGUAGE_LABELS[language]}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

const SIZES = {
  xs: { w: 5, h: 11, gap: 2 },
  sm: { w: 8, h: 15, gap: 3 },
  md: { w: 13, h: 21, gap: 4 },
  lg: { w: 18, h: 26, gap: 5 },
} as const;

/**
 * Belt progress as slanted slots: one per belt after white, each lit in its
 * own belt colour up to the student's level.
 */
export function BeltStrip({
  level,
  size = "md",
  delay = 0,
  tone = "auto",
}: {
  level: number;
  size?: keyof typeof SIZES;
  delay?: number;
  /** "dark" for always-dark stages such as the podium. */
  tone?: "auto" | "dark";
}) {
  const reduced = useReducedMotion();
  const belt = beltOf(level);
  const dims = SIZES[size];
  return (
    <span
      role="img"
      aria-label={`${belt.name} belt, level ${belt.level} of ${BELT_SLOTS}`}
      className="inline-flex shrink-0 items-center"
      style={{ gap: dims.gap, paddingInline: dims.h * 0.2 }}
    >
      {BELT_LADDER.slice(1).map((slot, index) => {
        const lit = index < belt.level;
        return (
          <span
            key={slot.name}
            className={`relative block overflow-hidden rounded-[2px] ${tone === "dark" ? "bg-white/12" : "bg-[color-mix(in_srgb,var(--ink)_7%,var(--sunken))]"}`}
            style={{ width: dims.w, height: dims.h, transform: "skewX(-18deg)" }}
          >
            {lit ? (
              <motion.span
                className="absolute inset-0 origin-bottom"
                style={{
                  background: beltFill(slot),
                  boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.18)",
                }}
                initial={reduced ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: delay + index * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              />
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

/** Slanted belt name tag, e.g. "Green Belt ✓". */
export function BeltTag({ level, compact = false }: { level: number; compact?: boolean }) {
  const belt = beltOf(level);
  return (
    <span
      className={`inline-flex shrink-0 items-center font-display font-semibold ${compact ? "text-[11px]" : "text-[12.5px]"}`}
      style={{ transform: "skewX(-14deg)" }}
    >
      <span
        className={`relative inline-flex items-center gap-1.5 overflow-hidden ${compact ? "px-2 py-0.5" : "px-2.5 py-1"}`}
        style={{ background: belt.soft, color: belt.text }}
      >
        {belt.striped ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1"
            style={{ background: beltFill(belt) }}
          />
        ) : null}
        <span style={{ transform: "skewX(14deg)" }} className="inline-flex items-center gap-1.5">
          {belt.name} Belt
          {belt.level > 0 ? <Check size={compact ? 11 : 12} strokeWidth={3} /> : null}
        </span>
      </span>
    </span>
  );
}

/**
 * Compact belt marker for dense lists: the language logo and one slanted
 * swatch in the current belt's colour.
 */
export function BeltBadge({ language, level }: { language: Language; level: number }) {
  const belt = beltOf(level);
  return (
    <span
      title={`${LANGUAGE_LABELS[language]} · ${belt.name} Belt`}
      aria-label={`${LANGUAGE_LABELS[language]}: ${belt.name} Belt`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-1.5 py-1"
    >
      <LanguageLogo language={language} size={15} />
      <span
        aria-hidden="true"
        className="block h-3 w-5 rounded-[2px]"
        style={{
          background: beltFill(belt),
          transform: "skewX(-18deg)",
          boxShadow: belt.level === 0 ? "inset 0 0 0 1px rgba(0,0,0,0.12)" : "inset 0 -1px 0 rgba(0,0,0,0.18)",
        }}
      />
    </span>
  );
}

/** Logo, belt strip and level — one line per language. */
export function LanguageBelt({
  language,
  level,
  size = "sm",
  showTag = false,
  delay = 0,
}: {
  language: Language;
  level: number;
  size?: keyof typeof SIZES;
  showTag?: boolean;
  delay?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <LanguageLogo language={language} size={size === "xs" ? 14 : size === "sm" ? 18 : 24} />
      <BeltStrip level={level} size={size} delay={delay} />
      {showTag ? <BeltTag level={level} compact={size === "xs" || size === "sm"} /> : null}
    </span>
  );
}
