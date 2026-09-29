"use client";

/**
 * Liquid-glass surface.
 * Adapted from React Bits "GlassSurface" (https://reactbits.dev) by David Haz,
 * MIT + Commons Clause.
 *
 * Changes from the original:
 *  - Renders as a background layer (children sit on top, nothing is clipped),
 *    so dropdowns can escape the bar.
 *  - Light theme only, to match the app.
 *  - SVG-refraction support is read with useSyncExternalStore, so SSR markup
 *    matches the first client render.
 *  - The SVG displacement (refraction) path is dropped: on a bar this thin it
 *    smeared text into rainbow fringes, and Safari/Firefox never supported it.
 *    In its place: layered frost, a gradient rim and a cursor-following
 *    specular glint that behave the same in every browser.
 */

import { useEffect, useRef } from "react";

type GlassSurfaceProps = {
  radius?: number;
  className?: string;
};

export function GlassSurface({
  radius = 20,
  className = "",
}: GlassSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Specular glint follows the pointer across the glass.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let frame = 0;

    function onPointerMove(event: PointerEvent) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!surface) return;
        const rect = surface.getBoundingClientRect();
        const near =
          event.clientY < rect.bottom + 120 && event.clientY > rect.top - 40;
        surface.style.setProperty(
          "--glint-x",
          `${event.clientX - rect.left}px`,
        );
        surface.style.setProperty("--glint-o", near ? "1" : "0");
      });
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <div
      ref={surfaceRef}
      aria-hidden="true"
      className={`pointer-events-none overflow-hidden ${className}`}
      style={{
        borderRadius: radius,
        ["--glint-x" as string]: "50%",
        ["--glint-o" as string]: "0",
        // Colours come from the --glass-* theme tokens in globals.css.
        background: "var(--glass)",
        backdropFilter: "blur(22px) saturate(1.9) brightness(1.03)",
        WebkitBackdropFilter: "blur(22px) saturate(1.9) brightness(1.03)",
        boxShadow: [
          "inset 0 1px 0 var(--glass-edge)",
          "inset 0 0 0 1px var(--glass-edge-dim)",
          "var(--glass-shadow)",
        ].join(", "),
      }}
    >
      {/* Top sheen */}
      <div
        className="absolute inset-x-0 top-0 h-1/2"
        style={{
          background:
            "linear-gradient(180deg, var(--glass-sheen) 0%, transparent 100%)",
        }}
      />
      {/* Cursor glint */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: "var(--glint-o)",
          background:
            "radial-gradient(180px 90px at var(--glint-x) 0%, var(--glass-glint), transparent 70%)",
        }}
      />
      {/* Gradient rim */}
      <div
        className="absolute inset-0"
        style={{
          borderRadius: radius,
          padding: 1,
          background:
            "linear-gradient(135deg, var(--glass-edge) 0%, var(--glass-edge-dim) 35%, var(--line) 65%, var(--glass-edge) 100%)",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
        }}
      />
    </div>
  );
}
