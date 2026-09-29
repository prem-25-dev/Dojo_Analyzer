"use client";

import { motion, useReducedMotion } from "motion/react";
import { CircleAlert } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { DojoLoader } from "@/components/ui/dojo-loader";

/** A shimmering placeholder block. Size it with classes. */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div aria-hidden="true" className={`skeleton ${className}`} style={style} />
  );
}

function cleanLabel(message: string) {
  return message.replace(/(\.\.\.|…)$/, "");
}

/** Small pill with a live dot and bouncing ellipsis, e.g. "Checking your account". */
export function StatusPill({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surface/90 px-3.5 py-1.5 text-[12.5px] font-medium text-ink-2 shadow-[var(--pop-shadow)] backdrop-blur"
    >
      <span className="relative flex h-2 w-2">
        <span className="dojo-anim absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand)] opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--brand)]" />
      </span>
      {cleanLabel(label)}
      <span aria-hidden="true" className="-ml-1.5 inline-flex gap-0.5">
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
    </div>
  );
}


/**
 * In-page loading card: faint ghost rows behind the dojo loader, sized like
 * the content it stands in for.
 */
export function PanelSkeleton({
  rows = 5,
  label,
  className = "",
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative grid min-h-64 place-items-center overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-[var(--card-shadow)] ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 space-y-3 p-5 opacity-50 [mask-image:radial-gradient(ellipse_at_center,transparent_18%,black_75%)]"
      >
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton
                className="h-3"
                style={{ width: `${55 - ((i * 13) % 25)}%` }}
              />
              <Skeleton
                className="h-2.5"
                style={{ width: `${30 + ((i * 7) % 20)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="relative py-6">
        <DojoLoader compact label={label} />
      </div>
    </div>
  );
}

/** Whole-page loading state: the dojo loader, centred. */
export function PageSkeleton({ label }: { label?: string }) {
  return (
    <div className="grid min-h-[70vh] place-items-center px-6">
      <DojoLoader label={label} />
    </div>
  );
}

/**
 * Page-level state. While loading it shows the page wireframe with a status
 * pill; otherwise a compact message card (errors, redirects, access denied).
 */
export function PageState({
  message,
  detail,
  loading = false,
  children,
}: {
  message: string;
  detail?: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  if (loading) return <PageSkeleton label={message} />;
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 text-ink">
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-[var(--pop-shadow)]"
      >
        {detail ? (
          <span className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand-text">
            <CircleAlert size={20} />
          </span>
        ) : null}
        <p className="font-display text-lg font-bold">{cleanLabel(message)}</p>
        {detail ? <p className="mt-2 text-sm text-muted">{detail}</p> : null}
        {children ? <div className="mt-5">{children}</div> : null}
      </motion.div>
    </div>
  );
}
