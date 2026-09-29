"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownRight,
  Award,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LoaderCircle,
  Minus,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserX,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChartCarousel } from "@/components/dashboard/chart-carousel";
import { RangeExplorer } from "@/components/dashboard/range-explorer";
import { AnimatedList } from "@/components/reactbits/animated-list";
import { ClickSpark } from "@/components/reactbits/click-spark";
import { CountUp } from "@/components/reactbits/count-up";
import { GlowCursor } from "@/components/reactbits/glow-cursor";
import { Grainient } from "@/components/reactbits/grainient";
import { useChartSlides } from "@/components/dashboard/chart-slides";
import {
  formatNumber,
} from "@/components/dashboard/chart-kit";
import {
  LANGUAGE_LABELS,
  buildModel,
  groupsFor,
  lowCoverageSquads,
  movement,
  previousWeek,
  snapshot,
  stalledStudents,
  strongestLanguage,
  weekInfo,
  type DashboardData,
  type Model,
} from "@/lib/dashboard/metrics";
import { formatWeekDateRange } from "@/lib/weeks";
import { LanguageLogo } from "@/components/belts/belts";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DashboardData };

// ─── Data loading ─────────────────────────────────────────────────────────────
export function DashboardView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedYear = searchParams.get("academicYear") ?? "";
  const requestedUniversity = searchParams.get("university") ?? "";
  const requestedWeek = Number(searchParams.get("week"));
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState({ status: "loading" });
      try {
        const params = new URLSearchParams();
        if (requestedYear) params.set("academic_year", requestedYear);
        if (requestedUniversity)
          params.set("university_id", requestedUniversity);
        const response = await fetch(`/api/dashboard/overview?${params}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as DashboardData & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error ?? "Unable to load the dashboard.");
        setState({ status: "ready", data: body });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to load the dashboard.",
        });
      }
    }
    load();
    return () => controller.abort();
  }, [requestedYear, requestedUniversity, reloadKey]);

  function setParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  if (state.status === "loading")
    return (
      <Shell>
        <div className="flex min-h-[50vh] items-center justify-center gap-2.5 text-sm text-muted">
          <LoaderCircle className="animate-spin text-brand-text" size={18} />
          Loading dashboard…
        </div>
      </Shell>
    );
  if (state.status === "error")
    return (
      <Shell>
        <div
          role="alert"
          className="rounded-2xl border border-line bg-surface px-6 py-12 text-center"
        >
          <p className="text-sm text-ink-2">{state.message}</p>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="mt-4 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-line-strong"
          >
            Try again
          </button>
        </div>
      </Shell>
    );

  return (
    <LoadedDashboard
      data={state.data}
      requestedWeek={requestedWeek}
      onChange={setParams}
    />
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-2 lg:px-8">
      {children}
    </div>
  );
}

// ─── Loaded dashboard ─────────────────────────────────────────────────────────
function LoadedDashboard({
  data,
  requestedWeek,
  onChange,
}: {
  data: DashboardData;
  requestedWeek: number;
  onChange: (next: Record<string, string | null>) => void;
}) {
  const model = useMemo(() => buildModel(data), [data]);
  const latestWeek = model.weekNumbers.at(-1) ?? null;
  const week = model.weekNumbers.includes(requestedWeek)
    ? requestedWeek
    : latestWeek;
  const isSuperAdmin = data.role === "super_admin";
  const scopeName = data.universityId
    ? (data.universities.find((u) => u.id === data.universityId)?.name ??
      "Your university")
    : "All universities";

  return (
    <ClickSpark sparkColor="#ef3837">
      <Shell>
        <Header
          model={model}
          week={week}
          scopeName={scopeName}
          onChange={onChange}
        />

        {data.academicYears.length === 0 || week === null ? (
          <div className="rounded-2xl border border-line bg-surface px-6 py-16 text-center">
            <p className="font-display text-lg font-bold">No belt data yet</p>
            <p className="mt-1.5 text-sm text-muted">
              {data.role === "mentor"
                ? "Your campus manager hasn't imported any weekly belt results yet."
                : "Upload a weekly belt CSV to start seeing progress here."}
            </p>
          </div>
        ) : (
          <DashboardBody
            model={model}
            week={week}
            isSuperAdmin={isSuperAdmin}
          />
        )}
      </Shell>
    </ClickSpark>
  );
}

function DashboardBody({
  model,
  week,
  isSuperAdmin,
}: {
  model: Model;
  week: number;
  isSuperAdmin: boolean;
}) {
  const slides = useChartSlides(model, week);
  return (
    <div className="space-y-6">
      <KpiRow model={model} week={week} />
      <ChartCarousel slides={slides} />
      <RangeExplorer key={week} model={model} week={week} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <NeedsAttention model={model} week={week} />
        <TopMovers model={model} week={week} />
      </div>
      <GroupTable model={model} week={week} />
      {isSuperAdmin && <PlatformPanel />}
    </div>
  );
}

// ─── Header & filters ─────────────────────────────────────────────────────────
function Header({
  model,
  week,
  scopeName,
  onChange,
}: {
  model: Model;
  week: number | null;
  scopeName: string;
  onChange: (next: Record<string, string | null>) => void;
}) {
  const { data } = model;
  const selectedWeek = weekInfo(model, week);
  const weekDates = selectedWeek
    ? formatWeekDateRange(selectedWeek.start_date, selectedWeek.end_date)
    : null;

  const moves = week === null ? null : movement(model, week);
  const prev = week === null ? null : previousWeek(model, week);

  return (
    <header className="relative isolate mb-6 overflow-hidden rounded-3xl bg-[#0e0e10] text-white [clip-path:inset(0_round_1.5rem)]">
      <div aria-hidden="true" className="absolute inset-0 opacity-80">
        <Grainient
          color1="#0e0e10"
          color2="#40181a"
          color3="#ef3837"
          timeSpeed={0.12}
          warpStrength={0.8}
          warpAmplitude={40}
          grainAmount={0.07}
          contrast={1.25}
          saturation={0.9}
          zoom={1.1}
          centerX={0.35}
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-[#0e0e10] via-[#0e0e10]/70 to-[#0e0e10]/10"
      />

      {/* Glow trail follows the cursor behind the hero content. */}
      <GlowCursor
        className="relative z-10 !h-auto"
        color="#ef3837"
        secondaryColor="#f59e0b"
        trailWidth={7}
        glowIntensity={1.6}
        opacity={0.7}
      >
        <div className="flex flex-col gap-8 p-6 sm:p-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white/55">Dashboard</p>
            <h1 className="mt-1 font-display text-[32px] font-bold leading-tight tracking-[-0.035em] sm:text-[40px]">
              {scopeName}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-white/65">
              {week !== null && (
                <span>
                  Week {week}
                  {weekDates ? `, ${weekDates}` : ""}
                </span>
              )}
              {data.latestImport && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={13} />
                    Last import {relativeTime(data.latestImport.uploaded_at)}
                  </span>
                </>
              )}
            </p>

            {moves && week !== null && (
              <div className="mt-7 flex flex-wrap items-end gap-x-6 gap-y-2">
                <p className="font-display text-[56px] font-extrabold leading-none tracking-[-0.045em] sm:text-[68px]">
                  <CountUp
                    key={`${week}-${moves.beltsGained}`}
                    to={moves.beltsGained}
                    prefix={moves.beltsGained > 0 ? "+" : ""}
                  />
                </p>
                <div className="pb-1.5 text-[14px] leading-snug text-white/70">
                  <p className="font-semibold text-white">
                    belts gained in Week {week}
                  </p>
                  <p>
                    {prev === null
                      ? "First imported week"
                      : `${moves.up} students moved up since Week ${prev}`}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {data.role === "super_admin" && (
              <FilterSelect
                label="University"
                value={data.universityId ?? ""}
                onChange={(value) =>
                  onChange({ university: value || null, week: null })
                }
              >
                <option value="">All universities</option>
                {data.universities.map((university) => (
                  <option key={university.id} value={university.id}>
                    {university.name}
                  </option>
                ))}
              </FilterSelect>
            )}
            {data.academicYears.length > 0 && (
              <FilterSelect
                label="Academic year"
                value={String(data.academicYear ?? "")}
                onChange={(value) =>
                  onChange({ academicYear: value, week: null })
                }
              >
                {data.academicYears.map((year) => (
                  <option key={year} value={year}>
                    {year}–{String(year + 1).slice(-2)}
                  </option>
                ))}
              </FilterSelect>
            )}
            {model.weekNumbers.length > 0 && (
              <FilterSelect
                label="Week"
                value={String(week ?? "")}
                onChange={(value) => onChange({ week: value })}
              >
                {[...model.weekNumbers].reverse().map((weekNumber) => {
                  const info = weekInfo(model, weekNumber);
                  return (
                    <option key={weekNumber} value={weekNumber}>
                      Week {weekNumber}
                      {info
                        ? ` · ${formatWeekDateRange(info.start_date, info.end_date)}`
                        : ""}
                    </option>
                  );
                })}
              </FilterSelect>
            )}
          </div>
        </div>
      </GlowCursor>
    </header>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11.5px] font-medium text-white/55">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 min-w-[150px] cursor-pointer appearance-none rounded-xl border border-white/15 bg-white/10 pl-3.5 pr-9 font-display text-[14px] font-semibold text-white outline-none backdrop-blur-md transition hover:border-white/30 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/30 [&>option]:bg-surface [&>option]:text-ink"
        >
          {children}
        </select>
        <ChevronDown
          size={15}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/60"
        />
      </span>
    </label>
  );
}

function relativeTime(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

// ─── KPI bento (layout after the stats-06 block) ───────────────────────────────
/** Soft card tint from a theme colour; text stays in ink tokens. */
function tint(color: string) {
  return {
    background: `color-mix(in srgb, ${color} 7%, var(--surface))`,
    borderColor: `color-mix(in srgb, ${color} 24%, var(--line))`,
  };
}

function KpiRow({ model, week }: { model: Model; week: number }) {
  const prev = previousWeek(model, week);
  const now = snapshot(model, week);
  const before = prev === null ? null : snapshot(model, prev);
  const moves = movement(model, week);
  const untested = now.students - now.tested;
  const canManage = model.data.role !== "mentor";

  const coveragePct = now.coverage === null ? null : now.coverage * 100;
  const coverageDelta =
    before?.coverage != null && now.coverage !== null
      ? (now.coverage - before.coverage) * 100
      : null;
  const avgDelta =
    before?.avgBelts != null && now.avgBelts !== null
      ? now.avgBelts - before.avgBelts
      : null;
  const totalDelta = before ? now.totalBelts - before.totalBelts : null;
  const upByWeek = model.weekNumbers.map((weekNumber) => ({
    week: weekNumber,
    up: movement(model, weekNumber).up,
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KpiTile
        label="Students tested"
        icon={<Users />}
        color="var(--lang-cpp)"
        value={now.tested}
        suffix={`/ ${formatNumber(now.students)}`}
        delta={coverageDelta}
        deltaFormat={(value) => `${formatNumber(Math.abs(value), 0)} pts`}
        prev={prev}
        footer={
          <Meter
            value={coveragePct ?? 0}
            label={`${formatNumber(coveragePct, 0)}% of students in Week ${week}`}
          />
        }
      />
      <KpiTile
        label="Avg belts per student"
        icon={<Award />}
        color="var(--lang-nodejs)"
        value={now.avgBelts ?? 0}
        decimals={2}
        delta={avgDelta}
        deltaFormat={(value) => formatNumber(Math.abs(value), 2)}
        prev={prev}
        footer={<span>Across students tested in Week {week}</span>}
      />
      <KpiTile
        label="Moved up this week"
        icon={<TrendingUp />}
        color="var(--brand)"
        value={moves.up}
        prev={prev}
        className="lg:row-span-2"
        footer={
          <div className="flex h-full flex-col">
            <p>
              {prev === null ? (
                "First imported week — nothing to compare yet"
              ) : (
                <>
                  <strong className="font-semibold text-ink">
                    {moves.down}
                  </strong>{" "}
                  moved down ·{" "}
                  <strong className="font-semibold text-ink">
                    {moves.same}
                  </strong>{" "}
                  unchanged
                </>
              )}
            </p>
            <WeeklyBars data={upByWeek} current={week} />
          </div>
        }
      />
      <KpiTile
        label="Total belts held"
        icon={<Trophy />}
        color="var(--lang-python)"
        value={now.totalBelts}
        delta={totalDelta}
        deltaFormat={(value) => formatNumber(Math.abs(value))}
        prev={prev}
        footer={<LanguageSplit totals={now.languageTotals} />}
      />
      <KpiTile
        label="Not tested this week"
        icon={<UserX />}
        color="var(--lang-java)"
        value={untested}
        prev={prev}
        href={
          canManage && untested > 0
            ? `/students?${new URLSearchParams({
                academicYear: String(model.data.academicYear ?? ""),
                week: String(week),
                status: "missing",
              })}`
            : undefined
        }
        footer={
          <span>
            {untested === 0
              ? "Everyone has a belt record this week"
              : "Students with no belt record this week"}
          </span>
        }
      />
    </div>
  );
}

function KpiTile({
  label,
  icon,
  color,
  value,
  decimals = 0,
  suffix,
  delta,
  deltaFormat,
  prev,
  footer,
  href,
  className = "",
}: {
  label: string;
  icon: ReactNode;
  color: string;
  value: number;
  decimals?: number;
  suffix?: string;
  delta?: number | null;
  deltaFormat?: (value: number) => string;
  prev: number | null;
  footer: ReactNode;
  href?: string;
  className?: string;
}) {
  const hasDelta = delta !== undefined && delta !== null && prev !== null;
  const direction = !hasDelta
    ? 0
    : delta > 0.0001
      ? 1
      : delta < -0.0001
        ? -1
        : 0;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden="true"
          className="[&>svg]:h-8 [&>svg]:w-8 [&>svg]:stroke-[1.75px]"
          style={{ color }}
        >
          {icon}
        </span>
        {hasDelta && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${
              direction > 0
                ? "bg-success-soft text-success-text"
                : direction < 0
                  ? "bg-brand-soft text-brand-text"
                  : "bg-ink/[0.05] text-ink-2"
            }`}
            title={`Compared with Week ${prev}`}
          >
            {direction > 0 ? (
              <ArrowUpRight size={13} />
            ) : direction < 0 ? (
              <ArrowDownRight size={13} />
            ) : (
              <Minus size={13} />
            )}
            {deltaFormat ? deltaFormat(delta) : delta}
          </span>
        )}
      </div>
      <p className="mt-6 font-display text-[44px] font-bold leading-none tracking-[-0.04em] text-ink">
        <CountUp key={value} to={value} decimals={decimals} />
        {suffix && (
          <span className="ml-1.5 text-[20px] font-semibold tracking-[-0.02em] text-faint">
            {suffix}
          </span>
        )}
      </p>
      <p className="mt-3 text-[15px] font-medium text-ink-2">{label}</p>
      <div className="mt-auto flex-1 pt-4 text-[12.5px] text-muted">
        {footer}
      </div>
    </>
  );
  const classes = `group/kpi flex flex-col rounded-2xl border p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[var(--pop-shadow)] ${className}`;
  return href ? (
    <Link href={href} className={classes} style={tint(color)}>
      {body}
    </Link>
  ) : (
    <div className={classes} style={tint(color)}>
      {body}
    </div>
  );
}

/** Students who moved up each week; the selected week is highlighted. */
function WeeklyBars({
  data,
  current,
}: {
  data: Array<{ week: number; up: number }>;
  current: number;
}) {
  const max = Math.max(1, ...data.map((item) => item.up));
  return (
    <div className="mt-6 flex flex-1 flex-col justify-end">
      <ul
        className="flex h-40 items-end gap-2"
        aria-label="Students who moved up each week"
      >
        {data.map((item) => (
          <li
            key={item.week}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
          >
            <span className="text-[11.5px] font-semibold tabular-nums text-ink-2">
              {item.up}
            </span>
            <span
              className="w-full max-w-7 rounded-t-[4px] transition-[height] duration-700"
              style={{
                height: `${Math.max(4, (item.up / max) * 100)}%`,
                background:
                  item.week === current
                    ? "var(--brand)"
                    : "color-mix(in srgb, var(--brand) 28%, var(--surface))",
              }}
            />
            <span className="text-[11px] text-faint">W{item.week}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div
          className="h-full rounded-full bg-ink-2"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <p className="mt-1.5">{label}</p>
    </div>
  );
}

function LanguageSplit({ totals }: { totals: number[] }) {
  const entries = (
    Object.keys(LANGUAGE_LABELS) as Array<keyof typeof LANGUAGE_LABELS>
  ).map((language, index) => ({ language, value: totals[index] }));
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {entries.map(({ language, value }) => (
        <li key={language} className="flex items-center gap-1.5">
          <LanguageLogo language={language} size={16} />
          {LANGUAGE_LABELS[language]}{" "}
          <span className="font-semibold tabular-nums text-ink">{value}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Needs attention ──────────────────────────────────────────────────────────
function NeedsAttention({ model, week }: { model: Model; week: number }) {
  const { data } = model;
  const now = snapshot(model, week);
  const moves = movement(model, week);
  const lowSquads = lowCoverageSquads(model, week);
  const stalled = stalledStudents(model, week);
  const prev = previousWeek(model, week);
  const canManage = data.role !== "mentor";
  const periodParams = {
    academicYear: String(data.academicYear ?? ""),
    week: String(week),
  };

  // Week ids only line up for a single university.
  const fromWeekId = weekInfo(model, prev)?.id;
  const toWeekId = weekInfo(model, week)?.id;
  const decreasedHref =
    fromWeekId && toWeekId
      ? `/weekly-comparison?${new URLSearchParams({
          ...periodParams,
          from_week_id: fromWeekId,
          to_week_id: toWeekId,
          change: "decreased",
        })}`
      : "/weekly-comparison";

  const untested = now.students - now.tested;
  const decreasedNames = moves.changes
    .filter((change) => change.change < 0)
    .map((change) => model.studentName.get(change.studentId) ?? "Unknown");
  const stalledNames = stalled.map(
    (id) => model.studentName.get(id) ?? "Unknown",
  );

  const items = [
    {
      key: "untested",
      show: untested > 0,
      icon: <UserX size={16} />,
      tone: "warning" as const,
      title: `${formatNumber(untested)} students not tested in Week ${week}`,
      detail: `${formatNumber(now.coverage === null ? null : (1 - now.coverage) * 100, 0)}% of students have no belt record this week.`,
      href: canManage
        ? `/students?${new URLSearchParams({ ...periodParams, status: "missing" })}`
        : undefined,
    },
    {
      key: "coverage",
      show: lowSquads.length > 0,
      icon: <Users size={16} />,
      tone: "warning" as const,
      title: `${lowSquads.length} ${lowSquads.length === 1 ? "squad is" : "squads are"} under half tested`,
      detail: lowSquads
        .slice(0, 4)
        .map(
          (squad) =>
            `${squad.label} (${formatNumber((squad.coverage ?? 0) * 100, 0)}%)`,
        )
        .join(", "),
      href: canManage
        ? `/students?${new URLSearchParams({ ...periodParams, status: "incomplete" })}`
        : undefined,
    },
    {
      key: "down",
      show: decreasedNames.length > 0,
      icon: <TrendingDown size={16} />,
      tone: "critical" as const,
      title: `${decreasedNames.length} ${decreasedNames.length === 1 ? "student" : "students"} moved down since Week ${prev}`,
      detail: namesPreview(decreasedNames),
      href: decreasedHref,
    },
    {
      key: "stalled",
      show: stalledNames.length > 0,
      icon: <AlertTriangle size={16} />,
      tone: "warning" as const,
      title: `${stalledNames.length} ${stalledNames.length === 1 ? "student has" : "students have"} stalled`,
      detail: `No belt gained across their last 3 tests: ${namesPreview(stalledNames)}`,
      href: undefined,
    },
  ].filter((item) => item.show);

  return (
    <section className="rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)]">
      <div className="flex items-center justify-between border-b border-line px-5 py-4 lg:px-6">
        <h2 className="font-display text-[17px] font-bold tracking-[-0.02em]">
          Needs attention
        </h2>
        <span className="rounded-md bg-ink/[0.05] px-2 py-0.5 text-[12px] font-semibold text-ink-2">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-6 py-8 text-sm text-ink-2">
          <CheckCircle2 size={18} className="text-success-text" />
          Nothing needs attention for Week {week}.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const content = (
              <>
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    item.tone === "critical"
                      ? "bg-brand-soft text-brand-text"
                      : "bg-[#fab219]/15 text-warning-text"
                  }`}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[14px] font-semibold text-ink">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">
                    {item.detail}
                  </span>
                </span>
                {item.href && (
                  <ArrowRight
                    size={16}
                    className="mt-1 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink"
                  />
                )}
              </>
            );
            return (
              <li key={item.key}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="group flex gap-3 px-5 py-4 transition hover:bg-surface-2 lg:px-6"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex gap-3 px-5 py-4 lg:px-6">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function namesPreview(names: string[], limit = 3) {
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")} and ${names.length - limit} more`;
}

// ─── Top movers ───────────────────────────────────────────────────────────────
function TopMovers({ model, week }: { model: Model; week: number }) {
  const prev = previousWeek(model, week);
  const movers = movement(model, week)
    .changes.filter((change) => change.change > 0)
    .sort((a, b) => b.change - a.change || b.total - a.total);
  const canOpenHistory = model.data.role !== "mentor";

  return (
    <section className="rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)]">
      <div className="flex items-center justify-between border-b border-line px-5 py-4 lg:px-6">
        <div>
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em]">
            Top movers
          </h2>
          <p className="text-[12.5px] text-muted">
            {movers.length > 0
              ? `${movers.length} students gained belts since their previous test`
              : "Most belts gained since their previous test"}
          </p>
        </div>
        <Link
          href="/leaderboard"
          className="text-[13px] font-semibold text-ink-2 hover:text-ink"
        >
          Leaderboard
        </Link>
      </div>
      {prev === null ? (
        <p className="px-6 py-8 text-sm text-muted">
          Movers appear once a second week is imported.
        </p>
      ) : movers.length === 0 ? (
        <p className="px-6 py-8 text-sm text-muted">
          No student gained a belt in Week {week}.
        </p>
      ) : (
        <AnimatedList
          items={movers}
          maxHeight={352}
          getKey={(mover) => mover.studentId}
          renderItem={(mover, index) => {
            const squadId = model.studentSquad.get(mover.studentId);
            const row = (
              <>
                <span className="w-5 shrink-0 text-center font-display text-[13px] font-bold text-faint">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[14px] font-semibold text-ink">
                    {model.studentName.get(mover.studentId)}
                  </span>
                  <span className="block truncate text-[12.5px] text-muted">
                    {squadId ? model.squadLabel.get(squadId) : "—"} ·{" "}
                    {mover.total} belts now
                  </span>
                </span>
                <span className="rounded-md bg-success-soft px-2 py-0.5 text-[13px] font-semibold tabular-nums text-success-text">
                  +{mover.change}
                </span>
              </>
            );
            return canOpenHistory ? (
              <Link
                href={`/students/${mover.studentId}/history`}
                className="flex items-center gap-3 border-b border-line px-5 py-3 transition hover:bg-surface-2 lg:px-6"
              >
                {row}
              </Link>
            ) : (
              <div className="flex items-center gap-3 border-b border-line px-5 py-3 lg:px-6">
                {row}
              </div>
            );
          }}
        />
      )}
    </section>
  );
}

// ─── Squad / university table ─────────────────────────────────────────────────
function GroupTable({ model, week }: { model: Model; week: number }) {
  const canSplitUniversity =
    model.data.role === "super_admin" && model.multiUniversity;
  const [groupBy, setGroupBy] = useState<"squad" | "university">(
    canSplitUniversity ? "university" : "squad",
  );
  const effectiveGroupBy = canSplitUniversity ? groupBy : "squad";
  const prev = previousWeek(model, week);
  const rows = groupsFor(model, effectiveGroupBy).map((group) => {
    const now = snapshot(model, week, effectiveGroupBy, group.key);
    const before =
      prev === null ? null : snapshot(model, prev, effectiveGroupBy, group.key);
    return {
      ...group,
      now,
      avgDelta:
        before?.avgBelts != null && now.avgBelts !== null
          ? now.avgBelts - before.avgBelts
          : null,
      strongest: strongestLanguage(now),
    };
  });
  const squadNumber = new Map(
    model.data.squads.map((squad) => [squad.id, squad.squad_number]),
  );
  const canManage = model.data.role !== "mentor";

  return (
    <section className="rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 lg:px-6">
        <div>
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em]">
            {effectiveGroupBy === "squad" ? "Squads" : "Universities"} at a
            glance
          </h2>
          <p className="text-[12.5px] text-muted">Week {week}</p>
        </div>
        {canSplitUniversity && (
          <div className="flex rounded-lg bg-ink/[0.045] p-0.5">
            {(["university", "squad"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={groupBy === option}
                onClick={() => setGroupBy(option)}
                className={`rounded-md px-3 py-1 font-display text-[13px] font-semibold transition ${
                  groupBy === option
                    ? "bg-surface text-ink shadow-[var(--card-shadow)] ring-[0.5px] ring-line"
                    : "text-muted hover:text-ink"
                }`}
              >
                {option === "squad" ? "Squads" : "Universities"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13.5px]">
          <thead className="text-[11.5px] font-medium text-muted">
            <tr className="border-b border-line">
              <th className="px-5 py-3 font-medium lg:px-6">
                {effectiveGroupBy === "squad" ? "Squad" : "University"}
              </th>
              <th className="px-4 py-3 text-right font-medium">Students</th>
              <th className="w-[200px] px-4 py-3 font-medium">Tested</th>
              <th className="px-4 py-3 text-right font-medium">Avg belts</th>
              <th className="px-4 py-3 text-right font-medium">
                vs Week {prev ?? "—"}
              </th>
              <th className="px-5 py-3 font-medium lg:px-6">Strongest in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const coverage =
                row.now.coverage === null ? 0 : row.now.coverage * 100;
              const href =
                canManage && effectiveGroupBy === "squad"
                  ? `/students?squad=${encodeURIComponent(squadNumber.get(row.key) ?? "")}`
                  : null;
              return (
                <tr key={row.key} className="hover:bg-surface-2">
                  <td className="px-5 py-3.5 font-display font-semibold text-ink lg:px-6">
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {row.label}
                      </Link>
                    ) : (
                      row.label
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums">
                    {formatNumber(row.now.students)}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                        <div
                          className="h-full rounded-full bg-ink-2"
                          style={{ width: `${coverage}%` }}
                        />
                      </div>
                      <span className="w-16 text-right tabular-nums text-ink-2">
                        {row.now.tested}/{row.now.students}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold tabular-nums">
                    {formatNumber(row.now.avgBelts, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums">
                    <Delta value={row.avgDelta} />
                  </td>
                  <td className="px-5 py-3.5 lg:px-6">
                    {row.strongest ? (
                      <span className="inline-flex items-center gap-1.5 text-ink-2">
                        <LanguageLogo language={row.strongest} size={16} />
                        {LANGUAGE_LABELS[row.strongest]}
                      </span>
                    ) : (
                      <span className="text-faint">No belts yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-faint">—</span>;
  if (Math.abs(value) < 0.005) return <span className="text-muted">0.00</span>;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-semibold ${
        value > 0 ? "text-success-text" : "text-brand-text"
      }`}
    >
      {value > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {formatNumber(Math.abs(value), 2)}
    </span>
  );
}

// ─── Super admin: platform & activity ─────────────────────────────────────────
type PlatformOverview = {
  totals: {
    universities: number;
    students: number;
    squads: number;
    campus_managers: number;
    mentors: number;
  };
  recentActivity: Array<{
    actor: string;
    action: string;
    target_type: string;
    created_at: string;
  }>;
};

function PlatformPanel() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/super-admin/dashboard", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        setOverview((await response.json()) as PlatformOverview);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setFailed(true);
      }
    }
    load();
    return () => controller.abort();
  }, []);

  if (failed) return null;
  const totals = overview?.totals;
  const stats = [
    {
      label: "Universities",
      value: totals?.universities,
      href: "/universities",
    },
    { label: "Squads", value: totals?.squads },
    {
      label: "Campus managers",
      value: totals?.campus_managers,
      href: "/users",
    },
    { label: "Mentors", value: totals?.mentors, href: "/users" },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <section className="rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)]">
        <div className="border-b border-line px-5 py-4 lg:px-6">
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em]">
            Platform
          </h2>
        </div>
        <dl className="grid grid-cols-2">
          {stats.map((stat, index) => {
            const body = (
              <>
                <dt className="text-[12.5px] text-muted">{stat.label}</dt>
                <dd className="mt-1 font-display text-[26px] font-bold tracking-[-0.03em] text-ink">
                  {stat.value === undefined ? "—" : formatNumber(stat.value)}
                </dd>
              </>
            );
            const className = `block px-5 py-4 lg:px-6 ${index % 2 === 0 ? "border-r border-line" : ""} ${index < 2 ? "border-b border-line" : ""}`;
            return stat.href ? (
              <Link
                key={stat.label}
                href={stat.href}
                className={`${className} transition hover:bg-surface-2`}
              >
                {body}
              </Link>
            ) : (
              <div key={stat.label} className={className}>
                {body}
              </div>
            );
          })}
        </dl>
      </section>

      <section className="rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 lg:px-6">
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em]">
            Recent activity
          </h2>
          <Link
            href="/audit-logs"
            className="text-[13px] font-semibold text-ink-2 hover:text-ink"
          >
            Audit logs
          </Link>
        </div>
        {!overview ? (
          <p className="px-6 py-8 text-sm text-muted">Loading…</p>
        ) : overview.recentActivity.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {overview.recentActivity.slice(0, 5).map((entry, index) => (
              <li
                key={`${entry.created_at}-${index}`}
                className="flex items-center justify-between gap-4 px-5 py-3 text-[13.5px] lg:px-6"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{entry.actor}</span>{" "}
                  <span className="text-ink-2">
                    {entry.action.replaceAll("_", " ")}
                  </span>
                </span>
                <span className="shrink-0 text-[12.5px] text-muted">
                  {relativeTime(entry.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
