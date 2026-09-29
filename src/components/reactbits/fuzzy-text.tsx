"use client";

/**
 * Text drawn to a canvas with a scanline "fuzz" that intensifies on hover.
 * Adapted from React Bits "FuzzyText" (https://reactbits.dev) by David Haz,
 * MIT + Commons Clause.
 *
 * Changes: sized from its container width (re-measured on resize) instead of
 * a fixed font size, rendered at device pixel ratio so large text stays
 * sharp, a vertical gradient fill, and a still frame for reduced motion.
 */

import { useEffect, useRef } from "react";

type FuzzyTextProps = {
  text: string;
  /** Font size as a fraction of the container width. */
  widthRatio?: number;
  fontWeight?: number;
  fontFamily?: string;
  /** Top-to-bottom colour stops. */
  gradient?: string[];
  baseIntensity?: number;
  hoverIntensity?: number;
  fuzzRange?: number;
  glitchInterval?: number;
  glitchDuration?: number;
  className?: string;
};

export function FuzzyText({
  text,
  widthRatio = 0.42,
  fontWeight = 900,
  fontFamily,
  gradient = ["#ffffff", "#ef3837"],
  baseIntensity = 0.12,
  hoverIntensity = 0.55,
  fuzzRange = 34,
  glitchInterval = 3200,
  glitchDuration = 180,
  className = "",
}: FuzzyTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gradientKey = gradient.join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !host || !ctx) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const stops = gradientKey.split("|");
    let frame = 0;
    let cancelled = false;
    let hovering = false;
    let glitching = false;
    let intensity = baseIntensity;
    let offscreen: HTMLCanvasElement | null = null;
    let textHeight = 0;
    let margin = 0;
    let glitchTimer = 0;
    let glitchEnd = 0;

    async function build() {
      if (!canvas || !host || !ctx) return;
      const family =
        fontFamily ?? (window.getComputedStyle(canvas).fontFamily || "sans-serif");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = Math.max(64, host.clientWidth * widthRatio);
      const font = `${fontWeight} ${size}px ${family}`;
      try {
        await document.fonts.load(font);
      } catch {
        await document.fonts.ready;
      }
      if (cancelled) return;

      const off = document.createElement("canvas");
      const offCtx = off.getContext("2d");
      if (!offCtx) return;
      offCtx.font = font;
      const metrics = offCtx.measureText(text);
      const left = metrics.actualBoundingBoxLeft ?? 0;
      const ascent = metrics.actualBoundingBoxAscent ?? size;
      const descent = metrics.actualBoundingBoxDescent ?? size * 0.1;
      const width = Math.ceil(left + (metrics.actualBoundingBoxRight ?? metrics.width)) + 10;
      textHeight = Math.ceil(ascent + descent);

      off.width = Math.ceil(width * dpr);
      off.height = Math.ceil(textHeight * dpr);
      offCtx.scale(dpr, dpr);
      offCtx.font = font;
      const fill = offCtx.createLinearGradient(0, 0, 0, textHeight);
      stops.forEach((color, index) =>
        fill.addColorStop(index / Math.max(1, stops.length - 1), color),
      );
      offCtx.fillStyle = fill;
      offCtx.fillText(text, 5 - left, ascent);
      offscreen = off;

      margin = fuzzRange + 20;
      canvas.width = Math.ceil((width + margin * 2) * dpr);
      canvas.height = Math.ceil(textHeight * dpr);
      canvas.style.width = `${width + margin * 2}px`;
      canvas.style.height = `${textHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(reduced ? 0 : intensity);
    }

    function draw(amount: number) {
      if (!offscreen || !ctx || !canvas) return;
      const dpr = offscreen.height / textHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // One scanline at a time, each nudged sideways by a random amount.
      for (let row = 0; row < offscreen.height; row += 1) {
        const dx = Math.floor(amount * (Math.random() - 0.5) * fuzzRange);
        ctx.drawImage(
          offscreen,
          0,
          row,
          offscreen.width,
          1,
          margin + dx,
          row / dpr,
          offscreen.width / dpr,
          1 / dpr,
        );
      }
    }

    let last = 0;
    function run(time: number) {
      if (cancelled) return;
      if (time - last > 1000 / 45) {
        last = time;
        const target = glitching ? 1 : hovering ? hoverIntensity : baseIntensity;
        intensity += (target - intensity) * 0.2;
        draw(intensity);
      }
      frame = requestAnimationFrame(run);
    }

    function scheduleGlitch() {
      glitchTimer = window.setTimeout(() => {
        glitching = true;
        glitchEnd = window.setTimeout(() => {
          glitching = false;
          scheduleGlitch();
        }, glitchDuration);
      }, glitchInterval);
    }

    const enter = () => (hovering = true);
    const leave = () => (hovering = false);
    canvas.addEventListener("pointerenter", enter);
    canvas.addEventListener("pointerleave", leave);

    build().then(() => {
      if (cancelled || reduced) return;
      frame = requestAnimationFrame(run);
      scheduleGlitch();
    });

    let resizeTimer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => void build(), 120);
    });
    observer.observe(host);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(glitchTimer);
      window.clearTimeout(glitchEnd);
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      canvas.removeEventListener("pointerenter", enter);
      canvas.removeEventListener("pointerleave", leave);
    };
  }, [
    text,
    widthRatio,
    fontWeight,
    fontFamily,
    gradientKey,
    baseIntensity,
    hoverIntensity,
    fuzzRange,
    glitchInterval,
    glitchDuration,
  ]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={text}
      className={className}
    />
  );
}
