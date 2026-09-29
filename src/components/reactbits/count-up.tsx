"use client";

/**
 * Number that springs up to its value when scrolled into view.
 * Adapted from React Bits "CountUp" (https://reactbits.dev) by David Haz,
 * MIT + Commons Clause.
 *
 * Changes: explicit `decimals`, `prefix`/`suffix`, Indian digit grouping, and
 * reduced-motion users get the final value immediately.
 */

import { useInView, useMotionValue, useSpring } from "motion/react";
import { useCallback, useEffect, useRef } from "react";

type CountUpProps = {
  to: number;
  from?: number;
  decimals?: number;
  duration?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
};

export function CountUp({
  to,
  from = 0,
  decimals = 0,
  duration = 1.2,
  delay = 0,
  prefix = "",
  suffix = "",
  className = "",
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(from);
  const springValue = useSpring(motionValue, {
    damping: 20 + 40 * (1 / duration),
    stiffness: 100 * (1 / duration),
  });
  const isInView = useInView(ref, { once: true, margin: "0px" });

  const format = useCallback(
    (value: number) =>
      `${prefix}${value.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`,
    [decimals, prefix, suffix],
  );

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (ref.current) ref.current.textContent = format(reduced ? to : from);
    if (reduced || !isInView) return;
    const timeout = setTimeout(() => motionValue.set(to), delay * 1000);
    return () => clearTimeout(timeout);
  }, [isInView, motionValue, from, to, delay, format]);

  useEffect(
    () =>
      springValue.on("change", (latest: number) => {
        if (ref.current) ref.current.textContent = format(latest);
      }),
    [springValue, format],
  );

  return <span ref={ref} className={`tabular-nums ${className}`} />;
}
