"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CountUp } from "@/components/reactbits/count-up";
import { SpotlightCard } from "@/components/reactbits/spotlight-card";
import {
  AXIS_TICK,
  CHART,
  ChartTooltip,
  LANGUAGE_COLORS,
} from "@/components/dashboard/chart-kit";
import { LANGUAGES, LANGUAGE_LABELS, type Language } from "@/lib/dashboard/metrics";
import { LanguageLogo } from "@/components/belts/belts";

/* ─── Controls ───────────────────────────────────────────────────────────── */

/** Pill segmented control with a sliding highlight. */
export function Segmented<T extends string>({
  id,
  value,
  options,
  onChange,
  size = "md",
}: {
  id: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode }>;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      className="inline-flex rounded-xl border border-line bg-sunken p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`relative flex items-center gap-1.5 rounded-lg font-semibold transition-colors ${size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-4 py-1.5 text-[13px]"} ${active ? "text-ink" : "text-muted hover:text-ink-2"}`}
          >
            {active ? (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-lg bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            {option.icon ? <span className="relative">{option.icon}</span> : null}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Compact labelled select for filter toolbars. */
export function PillSelect({
  label,
  value,
  onChange,
  disabled = false,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`group relative flex min-w-0 items-center rounded-xl border border-transparent bg-sunken transition focus-within:border-line-strong focus-within:bg-surface ${disabled ? "opacity-60" : "hover:bg-surface-2"}`}
    >
      <span className="pointer-events-none pl-3 text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="min-w-0 max-w-[200px] cursor-pointer appearance-none truncate bg-transparent py-2 pl-2 pr-7 text-[13px] font-semibold text-ink outline-none disabled:cursor-not-allowed"
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-2.5 h-3 w-3 text-muted"
      >
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </label>
  );
}

/* ─── Stat tiles ─────────────────────────────────────────────────────────── */

export function Delta({
  value,
  suffix = "",
  label,
}: {
  value: number | null;
  suffix?: string;
  label?: string;
}) {
  if (value === null)
    return <span className="text-[11.5px] text-faint">{label ?? "no earlier data"}</span>;
  const rounded = Math.round(value * 10) / 10;
  const tone =
    rounded > 0
      ? "bg-success-soft text-success-text"
      : rounded < 0
        ? "bg-brand-soft text-brand-text"
        : "bg-sunken text-muted";
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
      <span
        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums ${tone}`}
      >
        <Icon size={11} strokeWidth={2.6} />
        {Math.abs(rounded)}
        {suffix}
      </span>
      {label}
    </span>
  );
}

export function StatTile({
  label,
  value,
  decimals = 0,
  icon,
  tint,
  footer,
  index = 0,
}: {
  label: string;
  value: number | null;
  decimals?: number;
  icon: ReactNode;
  tint: string;
  footer?: ReactNode;
  index?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
    >
      <SpotlightCard className="h-full p-4">
        <div className="flex items-start justify-between gap-2">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl"
            style={{
              color: tint,
              background: `color-mix(in srgb, ${tint} 13%, transparent)`,
            }}
          >
            {icon}
          </span>
        </div>
        <div className="mt-3 font-display text-[30px] font-bold leading-none tracking-[-0.035em] tabular-nums">
          {value === null ? "—" : <CountUp to={value} decimals={decimals} />}
        </div>
        <p className="mt-1.5 text-[13px] font-semibold text-ink-2">{label}</p>
        {footer ? <div className="mt-1.5">{footer}</div> : null}
      </SpotlightCard>
    </motion.div>
  );
}

/** Radial progress for a share (0–1), e.g. the improvement rate. */
export function RingStat({
  value,
  label,
  caption,
  color = "var(--status-up)",
}: {
  value: number;
  label: string;
  caption: ReactNode;
  color?: string;
}) {
  const reduced = useReducedMotion();
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--sunken)" strokeWidth="9" />
          <motion.circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: reduced ? circumference * (1 - clamped) : circumference }}
            animate={{ strokeDashoffset: circumference * (1 - clamped) }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-display text-[22px] font-bold tracking-[-0.03em] tabular-nums">
            <CountUp to={Math.round(clamped * 100)} />%
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="font-display text-[15px] font-semibold">{label}</p>
        <div className="mt-1 text-[13px] leading-5 text-muted">{caption}</div>
      </div>
    </div>
  );
}

/** Horizontal share bar with labelled segments. */
export function ShareBar({
  segments,
  onSelect,
  active,
}: {
  segments: Array<{ key: string; label: string; value: number; color: string }>;
  onSelect?: (key: string) => void;
  active?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-sunken">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <motion.button
              key={segment.key}
              type="button"
              title={`${segment.label}: ${segment.value}`}
              onClick={() => onSelect?.(segment.key)}
              disabled={!onSelect}
              initial={{ width: 0 }}
              animate={{ width: `${(segment.value / total) * 100}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className={`h-full first:rounded-l-full last:rounded-r-full transition-opacity ${active && active !== segment.key ? "opacity-40" : ""}`}
              style={{ background: segment.color }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((segment) => (
          <button
            key={segment.key}
            type="button"
            onClick={() => onSelect?.(segment.key)}
            disabled={!onSelect}
            className={`flex items-center gap-2 text-left text-[12.5px] transition ${active && active !== segment.key ? "opacity-50" : ""} ${onSelect ? "hover:opacity-100" : ""}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: segment.color }} />
            <span className="text-ink-2">{segment.label}</span>
            <span className="font-semibold tabular-nums text-ink">{segment.value}</span>
            <span className="tabular-nums text-faint">
              {Math.round((segment.value / total) * 100)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Language cards ─────────────────────────────────────────────────────── */

export type LanguageMetric = {
  total_final: number;
  belts_earned: number;
  average_final: number | null;
};

export function LanguageCards({
  breakdown,
  selected,
  onSelect,
}: {
  breakdown: Partial<Record<Language, LanguageMetric>> | undefined;
  selected?: string;
  onSelect?: (language: Language) => void;
}) {
  const reduced = useReducedMotion();
  const maxEarned = Math.max(
    1,
    ...LANGUAGES.map((language) => breakdown?.[language]?.belts_earned ?? 0),
  );
  const leader = [...LANGUAGES].sort(
    (a, b) => (breakdown?.[b]?.belts_earned ?? 0) - (breakdown?.[a]?.belts_earned ?? 0),
  )[0];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {LANGUAGES.map((language, index) => {
        const metric = breakdown?.[language];
        const color = LANGUAGE_COLORS[language];
        const isSelected = selected === language;
        const isLeader = (metric?.belts_earned ?? 0) > 0 && leader === language;
        return (
          <motion.button
            key={language}
            type="button"
            onClick={() => onSelect?.(language)}
            disabled={!onSelect}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index }}
            className={`group relative overflow-hidden rounded-2xl border bg-surface p-4 text-left transition ${isSelected ? "border-ink shadow-[var(--pop-shadow)]" : "border-line hover:border-line-strong hover:shadow-[var(--card-shadow)]"} ${onSelect ? "" : "cursor-default"}`}
          >
            <span
              aria-hidden="true"
              className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl transition group-hover:opacity-35"
              style={{ background: color }}
            />
            <div className="relative flex items-center justify-between">
              <span className="flex items-center gap-2 font-display text-[14px] font-semibold">
                <LanguageLogo language={language} size={16} />
                {LANGUAGE_LABELS[language]}
              </span>
              {isLeader ? (
                <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-success-text">
                  Leading
                </span>
              ) : null}
            </div>
            <div className="relative mt-3 flex items-baseline gap-2">
              <span className="font-display text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums">
                <CountUp to={metric?.belts_earned ?? 0} />
              </span>
              <span className="text-[12px] text-muted">belts earned</span>
            </div>
            <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
              <motion.div
                className="h-full rounded-full"
                style={{ background: color }}
                initial={{ width: 0 }}
                animate={{ width: `${((metric?.belts_earned ?? 0) / maxEarned) * 100}%` }}
                transition={{ delay: 0.15 + index * 0.06, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <div className="relative mt-3 grid grid-cols-2 gap-2 text-[12px]">
              <div>
                <p className="text-faint">Total level</p>
                <p className="font-semibold tabular-nums text-ink">{metric?.total_final ?? "—"}</p>
              </div>
              <div>
                <p className="text-faint">Avg / student</p>
                <p className="font-semibold tabular-nums text-ink">
                  {metric?.average_final == null ? "—" : metric.average_final.toFixed(2)}
                </p>
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

/* ─── Trend chart ────────────────────────────────────────────────────────── */

export type TrendPoint = {
  month: number;
  label: string;
  total_students: number;
  total_belts: number;
  belts_earned: number;
  improved_students: number;
  average_belts_per_student: number | null;
};

const TREND_METRICS = [
  { value: "belts_earned", label: "Belts earned" },
  { value: "improved_students", label: "Improved" },
  { value: "total_belts", label: "Total belts" },
  { value: "average_belts_per_student", label: "Avg / student" },
] as const;
type TrendMetric = (typeof TREND_METRICS)[number]["value"];

/** One metric at a time (they have different scales), switchable. */
export function TrendPanel({
  data,
  title,
  subtitle,
  highlightMonth,
}: {
  data: TrendPoint[];
  title: string;
  subtitle: string;
  highlightMonth?: number | null;
}) {
  const [metric, setMetric] = useState<TrendMetric>("belts_earned");
  const gradientId = useId().replace(/:/g, "");
  const meta = TREND_METRICS.find((item) => item.value === metric)!;
  const series = [{ key: metric, label: meta.label, color: "var(--action)" }];
  const decimals = metric === "average_belts_per_student" ? 2 : 0;

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--card-shadow)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[16px] font-semibold">{title}</h2>
          <p className="text-[12.5px] text-muted">{subtitle}</p>
        </div>
        <Segmented
          id={`trend-${gradientId}`}
          size="sm"
          value={metric}
          options={TREND_METRICS}
          onChange={setMetric}
        />
      </div>
      {data.length ? (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--action)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--action)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: CHART.axis }}
                tickFormatter={(value: string) => value.split(" ")[0]?.slice(0, 3) ?? value}
              />
              <YAxis
                allowDecimals={decimals > 0}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                cursor={{ stroke: CHART.axis }}
                content={
                  <ChartTooltip
                    series={series}
                    formatValue={(value) =>
                      value === null ? "—" : value.toFixed(decimals)
                    }
                  />
                }
              />
              <Area
                type="monotone"
                dataKey={metric}
                name={meta.label}
                stroke="var(--action)"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                connectNulls
                dot={(props: { cx?: number; cy?: number; payload?: TrendPoint; index?: number }) => {
                  const selected = props.payload?.month === highlightMonth;
                  return (
                    <circle
                      key={`dot-${props.index}`}
                      cx={props.cx}
                      cy={props.cy}
                      r={selected ? 5.5 : 3}
                      fill={selected ? "var(--surface)" : "var(--action)"}
                      stroke="var(--action)"
                      strokeWidth={selected ? 2.5 : 0}
                    />
                  );
                }}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-muted">No trend data yet.</p>
      )}
    </section>
  );
}

/* ─── Month strip ────────────────────────────────────────────────────────── */

/** One cell per month, shaded by belts earned; click to pick a month. */
export function MonthStrip({
  data,
  selected,
  onSelect,
}: {
  data: TrendPoint[];
  selected: number | null;
  onSelect: (month: number) => void;
}) {
  const max = Math.max(1, ...data.map((point) => point.belts_earned));
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {data.map((point) => {
        const strength = point.belts_earned / max;
        const active = point.month === selected;
        return (
          <button
            key={point.month}
            type="button"
            onClick={() => onSelect(point.month)}
            title={`${point.label}: ${point.belts_earned} belts earned`}
            className={`group min-w-[64px] flex-1 rounded-xl border p-2 text-left transition ${active ? "border-ink shadow-[var(--card-shadow)]" : "border-line hover:border-line-strong"}`}
          >
            <span
              className="block h-9 rounded-lg transition group-hover:brightness-105"
              style={{
                background: `color-mix(in srgb, var(--action) ${Math.round(8 + strength * 80)}%, var(--sunken))`,
              }}
            />
            <span className="mt-1.5 flex items-baseline justify-between gap-1">
              <span className={`text-[11.5px] font-semibold ${active ? "text-ink" : "text-ink-2"}`}>
                {point.label.split(" ")[0]?.slice(0, 3)}
              </span>
              <span className="text-[11px] tabular-nums text-muted">+{point.belts_earned}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Headline sentence ──────────────────────────────────────────────────── */

export function Headline({ children }: { children: ReactNode }) {
  return (
    <p className="font-display text-[22px] font-semibold leading-[1.3] tracking-[-0.02em] text-ink sm:text-[26px]">
      {children}
    </p>
  );
}

export function Em({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="rounded-md px-1 font-bold"
      style={{
        color: color ?? "var(--brand-text)",
        background: `color-mix(in srgb, ${color ?? "var(--brand)"} 10%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}
