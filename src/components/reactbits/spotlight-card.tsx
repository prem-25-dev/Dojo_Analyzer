"use client";

/**
 * Card with a soft spotlight that follows the cursor.
 * Adapted from React Bits "SpotlightCard" (https://reactbits.dev) by David Haz,
 * MIT + Commons Clause.
 *
 * Changes: themed surface (tokens instead of neutral-900), and the spotlight
 * position is written to CSS variables instead of React state, so moving the
 * mouse doesn't re-render the card's children.
 */

import { useRef, type HTMLAttributes, type ReactNode } from "react";

type SpotlightCardProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  spotlightColor?: string;
};

export function SpotlightCard({
  children,
  className = "",
  spotlightColor = "color-mix(in srgb, var(--brand) 9%, transparent)",
  ...rest
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const card = ref.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    card.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onPointerMove={move}
      className={`group/spot relative overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)] ${className}`}
      {...rest}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/spot:opacity-100"
        style={{
          background: `radial-gradient(260px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${spotlightColor}, transparent 75%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
