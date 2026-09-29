"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert } from "lucide-react";
import { useEffect } from "react";

export type ToastMessage = {
  id: number;
  message: string;
  tone?: "success" | "error";
};

/** One transient notice at the bottom of the screen; clears itself. */
export function Toast({
  toast,
  onDone,
}: {
  toast: ToastMessage | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(timer);
  }, [toast, onDone]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[110] flex justify-center px-4">
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.id}
            role="status"
            initial={{ opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-ink py-2 pl-2 pr-4 text-[13px] font-medium text-page shadow-[0_18px_40px_-14px_rgba(0,0,0,0.5)]"
          >
            <span
              className={`grid h-6 w-6 place-items-center rounded-full ${toast.tone === "error" ? "bg-[var(--brand)]" : "bg-[var(--status-up)]"} text-white`}
            >
              {toast.tone === "error" ? (
                <CircleAlert size={13} />
              ) : (
                <Check size={13} strokeWidth={3} />
              )}
            </span>
            {toast.message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
