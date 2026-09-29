"use client";

import Link from "next/link";
import { isTabActive, type NavGroup } from "@/components/navigation";

/** Glass segmented control linking the pages that share a navbar group. */
export function SectionTabs({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) {
  if (group.tabs.length < 2) return null;

  return (
    <div className="relative z-10 mx-auto max-w-[1440px] px-4 pt-5 lg:px-8">
      <nav
        aria-label={`${group.label} sections`}
        className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl p-[3px]"
        style={{
          background: "color-mix(in srgb, var(--ink) 4.5%, transparent)",
          boxShadow: "inset 0 0 0 0.5px var(--line)",
        }}
      >
        {group.tabs.map((tab) => {
          const active = isTabActive(tab, pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] px-3.5 py-1.5 font-display text-[13.5px] font-semibold tracking-[-0.01em] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-black/15 ${
                active
                  ? "bg-surface text-ink shadow-[var(--card-shadow)] ring-[0.5px] ring-line"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Icon
                size={15}
                strokeWidth={2}
                className={active ? "text-brand-text" : "text-faint"}
              />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
