"use client";

import type { ReactNode } from "react";
import { LANGUAGES, type Language } from "@/lib/dashboard/metrics";
import { LanguageLogo } from "@/components/belts/belts";

// ─── Palette ──────────────────────────────────────────────────────────────────
// Colours are CSS variables (see globals.css) so charts follow the theme. Each
// theme's set was validated for colour-vision deficiency on its own surface.
// Language hues are fixed per language, never by rank.
export const LANGUAGE_COLORS: Record<Language, string> = {
  cpp: "var(--lang-cpp)",
  java: "var(--lang-java)",
  nodejs: "var(--lang-nodejs)",
  python: "var(--lang-python)",
};

// Squads / universities take slots in their fixed list order (max 8).
export const ENTITY_COLORS = Array.from(
  { length: 8 },
  (_, index) => `var(--series-${index + 1})`,
);
export const OTHER_COLOR = "var(--series-other)";
export const MAX_SERIES = ENTITY_COLORS.length;

export const STATUS_COLORS = {
  up: "var(--status-up)",
  same: "var(--status-same)",
  down: "var(--status-down)",
  first: "var(--status-first)",
  untested: "var(--status-untested)",
};

export const CHART = {
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  tick: "var(--chart-tick)",
  ink: "var(--ink)",
  secondary: "var(--muted)",
};

export const AXIS_TICK = { fill: CHART.tick, fontSize: 12 };

export function colorFor(key: string, index: number) {
  if ((LANGUAGES as readonly string[]).includes(key))
    return LANGUAGE_COLORS[key as Language];
  return index < MAX_SERIES ? ENTITY_COLORS[index] : OTHER_COLOR;
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

// ─── Controls ─────────────────────────────────────────────────────────────────
export function ViewSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-muted">
      <span className="whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-8 cursor-pointer rounded-lg border border-line bg-surface pl-2.5 pr-7 font-display text-[13px] font-semibold text-ink outline-none transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-black/10"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── Legend & tooltip ─────────────────────────────────────────────────────────
export type SeriesKey = { key: string; label: string; color: string };

export function ChartLegend({ series }: { series: SeriesKey[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2">
      {series.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          {(LANGUAGES as readonly string[]).includes(item.key) ? (
            <LanguageLogo language={item.key as Language} size={15} />
          ) : (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ background: item.color }}
            />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

type TooltipEntry = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string | null;
  color?: string;
  payload?: Record<string, unknown>;
};

export function ChartTooltip({
  active,
  payload,
  label,
  series,
  formatValue,
  formatLabel,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  series?: SeriesKey[];
  formatValue: (value: number | null) => string;
  formatLabel?: (label: string | number | undefined) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[160px] rounded-xl border border-line bg-surface/95 px-3 py-2.5 text-[12.5px] shadow-[0_8px_24px_-8px_rgba(17,17,26,0.25)] backdrop-blur">
      {label !== undefined && (
        <p className="mb-1.5 font-display text-[12.5px] font-semibold text-ink">
          {formatLabel ? formatLabel(label) : label}
        </p>
      )}
      <ul className="space-y-1">
        {payload.map((entry) => {
          const key = `${entry.dataKey}:${entry.name}`;
          // Cartesian series match on dataKey; pie slices match on name.
          const meta = series?.find(
            (item) =>
              item.key === String(entry.dataKey) ||
              item.key === String(entry.name),
          );
          const value = typeof entry.value === "number" ? entry.value : null;
          return (
            <li key={key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-ink-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ background: meta?.color ?? entry.color }}
                />
                {meta?.label ?? entry.name}
              </span>
              <span className="font-semibold tabular-nums text-ink">
                {formatValue(value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Table view (every chart has one) ─────────────────────────────────────────
export type TableData = {
  columns: string[];
  rows: Array<Array<string | number>>;
};

export function DataTable({ table }: { table: TableData }) {
  return (
    <div className="max-h-[320px] overflow-auto rounded-xl border border-line">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-[0.08em] text-muted">
          <tr>
            {table.columns.map((column, index) => (
              <th
                key={column}
                className={`px-4 py-2.5 font-semibold ${index > 0 ? "text-right" : ""}`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                <td
                  key={index}
                  className={`px-4 py-2.5 ${index > 0 ? "text-right tabular-nums text-ink-2" : "font-medium text-ink"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-[13px] text-muted">
      {children}
    </div>
  );
}
