"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

const SIZES = {
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

/**
 * Animated modal rendered into <body>. A bottom sheet on phones, a centred
 * card from `sm` up. Escape and the backdrop close it unless `locked`.
 */
export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  description,
  icon,
  size = "md",
  locked = false,
  header,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  icon?: ReactNode;
  size?: keyof typeof SIZES;
  locked?: boolean;
  /** Replaces the default title block when given. */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);

  useEffect(() => {
    closeRef.current = onClose;
    lockedRef.current = locked;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first field (or the panel) once the panel is in the DOM.
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const target = panel?.querySelector<HTMLElement>(
        "[data-autofocus], input:not([disabled]), select:not([disabled]), textarea",
      );
      (target ?? panel)?.focus({ preventScroll: true });
    });

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !lockedRef.current) {
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          key="dialog"
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6"
        >
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-[rgba(10,10,12,0.45)] backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              if (!locked) onClose();
            }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-label={typeof title === "string" ? title : undefined}
            initial={
              reduced ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.97 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface text-ink shadow-[0_40px_120px_-30px_rgba(0,0,0,0.55)] outline-none sm:rounded-3xl ${SIZES[size]}`}
          >
            {/* Grab handle on phones */}
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
            {header ?? (
              <div className="flex items-start gap-3.5 px-6 pb-4 pt-5 sm:pt-6">
                {icon ? (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink">
                    {icon}
                  </span>
                ) : null}
                <div className="min-w-0 flex-1">
                  {eyebrow ? (
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-text">
                      {eyebrow}
                    </p>
                  ) : null}
                  <h2 className="font-display text-[19px] font-bold tracking-[-0.02em]">
                    {title}
                  </h2>
                  {description ? (
                    <p className="mt-1 text-[13px] leading-5 text-muted">
                      {description}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={locked}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted transition hover:rotate-90 hover:bg-sunken hover:text-ink disabled:opacity-40"
            >
              <X size={17} />
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            {footer ? (
              <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line bg-surface-2 px-6 py-4">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
