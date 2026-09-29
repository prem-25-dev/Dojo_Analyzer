"use client";

/**
 * Short spark burst wherever the user clicks inside the wrapped area.
 * Adapted from React Bits "ClickSpark" (https://reactbits.dev) by David Haz,
 * MIT + Commons Clause.
 *
 * Changes: the canvas sits above the content (the original drew under it, so
 * sparks were hidden by opaque cards), it only animates while sparks are
 * alive, and it is disabled for reduced-motion users.
 */

import { useEffect, useRef, type ReactNode } from "react";

type Spark = { x: number; y: number; angle: number; start: number };

type ClickSparkProps = {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  className?: string;
  children?: ReactNode;
};

export function ClickSpark({
  sparkColor = "#ef3837",
  sparkSize = 9,
  sparkRadius = 18,
  sparkCount = 8,
  duration = 420,
  className = "",
  children,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparks = useRef<Spark[]>([]);
  const frame = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const resize = () => {
      const { width, height } = parent.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, []);

  // The draw loop lives in a ref so onClick can start it; it stops itself
  // once every spark has faded.
  const draw = useRef<(now: number) => void>(() => {});
  useEffect(() => {
    draw.current = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      sparks.current = sparks.current.filter((spark) => {
        const progress = (now - spark.start) / duration;
        if (progress >= 1) return false;
        const eased = progress * (2 - progress);
        const distance = eased * sparkRadius;
        const length = sparkSize * (1 - eased);
        ctx.strokeStyle = sparkColor;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(
          spark.x + distance * Math.cos(spark.angle),
          spark.y + distance * Math.sin(spark.angle),
        );
        ctx.lineTo(
          spark.x + (distance + length) * Math.cos(spark.angle),
          spark.y + (distance + length) * Math.sin(spark.angle),
        );
        ctx.stroke();
        return true;
      });
      if (sparks.current.length)
        frame.current = requestAnimationFrame((time) => draw.current(time));
    };
  }, [duration, sparkColor, sparkRadius, sparkSize]);

  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = canvas.getBoundingClientRect();
    const now = performance.now();
    const wasIdle = sparks.current.length === 0;
    for (let i = 0; i < sparkCount; i += 1) {
      sparks.current.push({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        angle: (2 * Math.PI * i) / sparkCount,
        start: now,
      });
    }
    if (wasIdle)
      frame.current = requestAnimationFrame((time) => draw.current(time));
  }

  return (
    <div className={`relative ${className}`} onClick={onClick}>
      {children}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-40"
      />
    </div>
  );
}
