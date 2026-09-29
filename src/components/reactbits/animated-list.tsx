"use client";

/**
 * Scrollable list whose items pop in as they enter view, with edge fades.
 * Adapted from React Bits "AnimatedList" (https://reactbits.dev) by David Haz,
 * MIT + Commons Clause.
 *
 * Changes: renders arbitrary items via `renderItem` (the original only took
 * strings), themed fades/scrollbar, and the original's window-wide keydown
 * handler is removed — it hijacked Tab and arrow keys for the whole page.
 */

import { motion, useInView } from "motion/react";
import { useRef, useState, type ReactNode } from "react";

function AnimatedItem({
  children,
  delay,
}: {
  children: ReactNode;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4, once: true });
  return (
    <motion.div
      ref={ref}
      initial={{ scale: 0.92, opacity: 0, y: 6 }}
      animate={inView ? { scale: 1, opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.25, delay }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedList<T>({
  items,
  renderItem,
  getKey,
  maxHeight = 400,
  className = "",
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
  maxHeight?: number;
  className?: string;
}) {
  const [fade, setFade] = useState({ top: 0, bottom: 1 });

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    setFade({
      top: Math.min(scrollTop / 50, 1),
      bottom:
        scrollHeight <= clientHeight
          ? 0
          : Math.min((scrollHeight - scrollTop - clientHeight) / 50, 1),
    });
  }

  return (
    <div className={`relative ${className}`}>
      <div
        onScroll={onScroll}
        className="overflow-y-auto [scrollbar-color:var(--line-strong)_transparent] [scrollbar-width:thin]"
        style={{ maxHeight }}
      >
        {items.map((item, index) => (
          <AnimatedItem
            key={getKey(item, index)}
            delay={Math.min(index, 8) * 0.04}
          >
            {renderItem(item, index)}
          </AnimatedItem>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-surface to-transparent transition-opacity"
        style={{ opacity: fade.top }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-surface to-transparent transition-opacity"
        style={{ opacity: items.length > 6 ? fade.bottom : 0 }}
      />
    </div>
  );
}
