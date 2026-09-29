import type { ReactNode } from "react";

export const filterInputClass =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-[14px] text-ink outline-none transition placeholder:text-faint hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ink/10";

/** Filter bar shared by the leaderboard pages. */
export function LeaderboardFilters({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--card-shadow)]">
      {children}
    </div>
  );
}

export function FilterField({
  label,
  grow = false,
  children,
}: {
  label: string;
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1.5 ${grow ? "min-w-[220px] flex-1" : "min-w-[200px]"}`}
    >
      <span className="text-[12px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
