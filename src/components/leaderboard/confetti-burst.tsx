"use client";

import { useEffect, useRef } from "react";

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
};

const COLORS = ["#ef3837", "#f7d774", "#d4a72c", "#ffffff", "#ff8a86"];

/**
 * One-shot confetti burst from the top-centre of its box. Fires once after
 * `delay` ms and stops drawing when every piece has fallen out of view.
 * Skipped entirely for reduced-motion users.
 */
export function ConfettiBurst({
  delay = 900,
  count = 90,
  className = "",
}: {
  delay?: number;
  count?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let pieces: Piece[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      if (!canvas) return;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces = pieces.filter((piece) => piece.y < canvas.height + 20);
      for (const piece of pieces) {
        piece.vy += 0.16 * dpr;
        piece.vx *= 0.992;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rotation += piece.spin;
        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rotation);
        ctx.fillStyle = piece.color;
        ctx.fillRect(
          -piece.size / 2,
          -piece.size / 4,
          piece.size,
          piece.size / 2,
        );
        ctx.restore();
      }
      if (pieces.length) frame = requestAnimationFrame(draw);
    }

    const timeout = window.setTimeout(() => {
      resize();
      const originX = canvas.width / 2;
      const originY = canvas.height * 0.28;
      pieces = Array.from({ length: count }, () => {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
        const speed = (5 + Math.random() * 7) * dpr;
        return {
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: (6 + Math.random() * 6) * dpr,
          rotation: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.3,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
        };
      });
      frame = requestAnimationFrame(draw);
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [count, delay]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
