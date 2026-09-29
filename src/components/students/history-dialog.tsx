"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  CalendarRange,
  Flag,
  History,
  Layers,
  Mail,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/reactbits/count-up";
import {
  AXIS_TICK,
  CHART,
  ChartLegend,
  ChartTooltip,
  LANGUAGE_COLORS,
} from "@/components/dashboard/chart-kit";
import { LANGUAGES, LANGUAGE_LABELS, type Language } from "@/lib/dashboard/metrics";
import { StudentAvatar } from "@/components/students/avatar";
import { BeltStrip, BeltTag, LanguageLogo } from "@/components/belts/belts";
import { BELT_SLOTS, beltOf } from "@/lib/belts";
import {
  beltTotal,
  formatDate,
  type Student,
} from "@/components/students/types";

type Membership = {
  squad_number: string | null;
  start_date: string | null;
  end_date: string | null;
};

type WeeklyRecord = {
  academic_year: number | null;
  week_number: number | null;
  start_time: string | null;
  calculated_end_time: string | null;
  belt_test_updated_at: string | null;
  initial_belt_levels: Record<string, number> | null;
  final_belt_levels: Record<string, number> | null;
};

type HistoryResponse = {
  student: { id: string; name: string | null; email: string | null };
  memberships: Membership[];
  weeklyRecords: WeeklyRecord[];
};

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: HistoryResponse };

type Tab = "belts" | "progress" | "weeks" | "squads";

/** What the caller already knows (e.g. a leaderboard row), shown instantly. */
export type ProfileSnapshot = {
  rank?: number;
  score?: number;
  scoreLabel?: string;
  change?: number;
  levels?: Partial<Record<Language, number>>;
};

const SERIES = LANGUAGES.map((language) => ({
  key: language,
  label: LANGUAGE_LABELS[language],
  color: LANGUAGE_COLORS[language],
}));

/** Student history in a dialog: stats, a per-language chart, weekly log and squad timeline. */
export function HistoryDialog({
  student,
  onClose,
  snapshot,
  canViewHistory = true,
}: {
  student: Student | null;
  onClose: () => void;
  snapshot?: ProfileSnapshot;
  /** Students can't open other students' history; they get belts only. */
  canViewHistory?: boolean;
}) {
  // Keep the last student while the dialog animates out.
  const [shown, setShown] = useState(student);
  if (student && student !== shown) setShown(student);
  return (
    <Dialog
      open={Boolean(student)}
      onClose={onClose}
      title="Student history"
      size="xl"
      header={
        shown ? (
          <HistoryHeader
            student={shown}
            snapshot={snapshot}
            canViewHistory={canViewHistory}
          />
        ) : null
      }
    >
      {shown ? (
        canViewHistory ? (
          <HistoryBody key={shown.id} studentId={shown.id} snapshot={snapshot} />
        ) : (
          <div className="px-6 pb-6 pt-5">
            <BeltsPanel levels={snapshot?.levels} />
          </div>
        )
      ) : null}
    </Dialog>
  );
}

function HistoryHeader({
  student,
  snapshot,
  canViewHistory,
}: {
  student: Student;
  snapshot?: ProfileSnapshot;
  canViewHistory: boolean;
}) {
  return (
    <div className="relative overflow-hidden border-b border-line px-6 pb-5 pt-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(600px 180px at 0% 0%, color-mix(in srgb, var(--brand) 14%, transparent), transparent 70%), radial-gradient(420px 160px at 100% 0%, color-mix(in srgb, var(--lang-cpp) 14%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="relative flex flex-wrap items-center gap-4 pr-8">
        <div className="relative">
          <span
            aria-hidden="true"
            className="dojo-anim absolute -inset-1 animate-[spin_8s_linear_infinite] rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, var(--brand), transparent 40%, var(--lang-cpp), transparent 80%, var(--brand))",
            }}
          />
          <span className="relative block rounded-full bg-surface p-0.5">
            <StudentAvatar id={student.id} name={student.name} email={student.email} size={56} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-text">
            <History size={11} /> Dojo profile
            {snapshot?.rank ? (
              <span className="ml-1 rounded-full bg-ink px-2 py-0.5 text-[10.5px] tracking-normal text-page">
                Rank #{snapshot.rank}
              </span>
            ) : null}
          </p>
          <h2 className="truncate font-display text-[22px] font-bold tracking-[-0.025em]">
            {student.name ?? "Unnamed student"}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            {student.email ? (
              <span className="inline-flex items-center gap-1">
                <Mail size={12} /> {student.email}
              </span>
            ) : null}
            {student.squad_number ? (
              <span className="rounded-full border border-line bg-surface px-2 py-px font-semibold text-ink-2">
                Squad {student.squad_number}
              </span>
            ) : null}
            {student.university_name ? (
              <span>{student.university_name}</span>
            ) : null}
          </p>
        </div>
        {snapshot?.score !== undefined ? (
          <div className="text-right">
            <p className="font-display text-[30px] font-bold leading-none tracking-[-0.03em] tabular-nums">
              {snapshot.score}
            </p>
            <p className="text-[11.5px] text-muted">
              {snapshot.scoreLabel ?? "belts"}
              {snapshot.change ? (
                <span className="ml-1 font-semibold text-success-text">
                  {snapshot.change > 0 ? `+${snapshot.change}` : snapshot.change} this week
                </span>
              ) : null}
            </p>
          </div>
        ) : null}
        {canViewHistory ? (
          <Link
            href={`/students/${student.id}/history`}
            className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-ink-2 transition hover:border-ink/40 hover:text-ink"
          >
            Full page <ArrowUpRight size={13} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function recordKey(record: WeeklyRecord) {
  return (record.academic_year ?? 0) * 100 + (record.week_number ?? 0);
}

function weekLabel(record: WeeklyRecord) {
  return `W${record.week_number ?? "?"} '${String(record.academic_year ?? "").slice(-2)}`;
}

function gained(record: WeeklyRecord) {
  let total = 0;
  for (const language of LANGUAGES) {
    const before = record.initial_belt_levels?.[language];
    const after = record.final_belt_levels?.[language];
    if (typeof before === "number" && typeof after === "number")
      total += Math.max(0, after - before);
  }
  return total;
}

function HistoryBody({
  studentId,
  snapshot,
}: {
  studentId: string;
  snapshot?: ProfileSnapshot;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("belts");
  const reduced = useReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/students/${studentId}/history`, {
          signal: controller.signal,
        });
        const result = (await response.json()) as HistoryResponse & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error ?? "Unable to load student history.");
        setLoad({ status: "ready", data: result });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setLoad({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to load student history.",
        });
      }
    })();
    return () => controller.abort();
  }, [studentId]);

  if (load.status === "loading") return <HistorySkeleton />;
  if (load.status === "error")
    return (
      <div className="px-6 py-14 text-center">
        <p className="font-display text-lg font-bold">Couldn’t load history</p>
        <p className="mt-1 text-sm text-muted">{load.message}</p>
      </div>
    );

  const { data } = load;
  const records = [...data.weeklyRecords].sort(
    (a, b) => recordKey(a) - recordKey(b),
  );
  const latest = records.at(-1);
  const totalGained = records.reduce((sum, record) => sum + gained(record), 0);
  const current = beltTotal(latest?.final_belt_levels);
  const promotedWeeks = records.filter((record) => gained(record) > 0).length;

  const stats = [
    { label: "Weeks tracked", value: records.length, icon: CalendarRange },
    { label: "Belts gained", value: totalGained, icon: TrendingUp },
    { label: "Current belt total", value: current, icon: Layers },
    { label: "Squads joined", value: data.memberships.length, icon: Flag },
  ];

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "belts", label: "Belts" },
    { id: "progress", label: "Progress" },
    { id: "weeks", label: "Weekly log", count: records.length },
    { id: "squads", label: "Squads", count: data.memberships.length },
  ];

  return (
    <div className="px-6 pb-6 pt-5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="rounded-2xl border border-line bg-surface-2 p-3.5"
          >
            <stat.icon size={15} className="text-muted" />
            <p className="mt-2.5 font-display text-[24px] font-bold leading-none tracking-[-0.03em] tabular-nums">
              <CountUp to={stat.value} duration={0.9} />
            </p>
            <p className="mt-1 text-[11.5px] text-muted">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div
        role="tablist"
        aria-label="History sections"
        className="mt-5 inline-flex rounded-xl border border-line bg-sunken p-1"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`relative rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${tab === item.id ? "text-ink" : "text-muted hover:text-ink-2"}`}
          >
            {tab === item.id ? (
              <motion.span
                layoutId="history-tab"
                className="absolute inset-0 rounded-lg bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative">
              {item.label}
              {item.count !== undefined ? (
                <span className="ml-1.5 text-[11px] text-faint">
                  {item.count}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="mt-4"
        >
          {tab === "belts" ? (
            <BeltsPanel
              levels={
                (latest?.final_belt_levels as Partial<Record<Language, number>> | null) ??
                snapshot?.levels
              }
              previous={latest?.initial_belt_levels as Partial<Record<Language, number>> | null}
            />
          ) : tab === "progress" ? (
            <ProgressPanel
              records={records}
              latest={latest}
              promotedWeeks={promotedWeeks}
            />
          ) : tab === "weeks" ? (
            <WeeklyLog records={records} />
          ) : (
            <SquadTimeline memberships={data.memberships} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Coding-workouts style: one row per language with its belt ladder. */
function BeltsPanel({
  levels,
  previous,
}: {
  levels: Partial<Record<Language, number>> | null | undefined;
  previous?: Partial<Record<Language, number>> | null;
}) {
  const reduced = useReducedMotion();
  const best = [...LANGUAGES].sort((a, b) => (levels?.[b] ?? 0) - (levels?.[a] ?? 0))[0];
  const bestBelt = beltOf(levels?.[best] ?? 0);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
      <section className="rounded-2xl border border-line">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <h3 className="font-display text-[15px] font-semibold">Coding belts</h3>
          <span className="h-px flex-1 bg-line" />
          <span className="text-[12px] text-muted">{BELT_SLOTS} belts per language</span>
        </div>
        <ul className="divide-y divide-line">
          {LANGUAGES.map((language, index) => {
            const level = levels?.[language] ?? 0;
            const before = previous?.[language];
            const next = beltOf(level + 1);
            const promoted = typeof before === "number" && level > before;
            return (
              <motion.li
                key={language}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
              >
                <LanguageLogo language={language} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-16 font-display text-[15px] font-semibold">
                      {LANGUAGE_LABELS[language]}
                    </span>
                    <BeltStrip level={level} size="md" delay={0.15 + index * 0.08} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <BeltTag level={level} />
                    {promoted ? (
                      <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-text">
                        Promoted this week
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-display text-[22px] font-bold leading-none tabular-nums">
                    {Math.min(level, BELT_SLOTS)}
                    <span className="text-[13px] font-semibold text-faint">/{BELT_SLOTS}</span>
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {level >= BELT_SLOTS ? "Top belt" : `Next: ${next.name}`}
                  </p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </section>
      <aside
        className="relative overflow-hidden rounded-2xl border border-line p-5"
        style={{
          background: `radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, ${bestBelt.color} 26%, transparent), transparent 70%), var(--surface-2)`,
        }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Highest belt</p>
        <div className="mt-4 flex justify-center">
          <LanguageLogo language={best} size={64} />
        </div>
        <p className="mt-4 text-center font-display text-[20px] font-bold tracking-[-0.02em]">
          {bestBelt.name} Belt
        </p>
        <p className="text-center text-[12.5px] text-muted">in {LANGUAGE_LABELS[best]}</p>
        <div className="mt-4 flex justify-center">
          <BeltStrip level={bestBelt.level} size="sm" delay={0.3} />
        </div>
        <p className="mt-4 text-center text-[12px] text-muted">
          {LANGUAGES.reduce((sum, language) => sum + (levels?.[language] ?? 0), 0)} belts across all languages
        </p>
      </aside>
    </div>
  );
}

function ProgressPanel({
  records,
  latest,
  promotedWeeks,
}: {
  records: WeeklyRecord[];
  latest: WeeklyRecord | undefined;
  promotedWeeks: number;
}) {
  if (!records.length)
    return <Empty message="No weekly belt records yet for this student." />;

  const chartData = records.map((record) => ({
    label: weekLabel(record),
    ...Object.fromEntries(
      LANGUAGES.map((language) => [
        language,
        record.final_belt_levels?.[language] ?? null,
      ]),
    ),
  }));
  const maxLevel = Math.max(
    1,
    ...LANGUAGES.map((language) => latest?.final_belt_levels?.[language] ?? 0),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="rounded-2xl border border-line p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-[14px] font-semibold">
            Belt level by language
          </p>
          <ChartLegend series={SERIES} />
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
            >
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: CHART.axis }}
                minTickGap={16}
              />
              <YAxis
                allowDecimals={false}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: CHART.axis }}
                content={
                  <ChartTooltip
                    series={SERIES}
                    formatValue={(value) =>
                      value === null ? "—" : `Belt ${value}`
                    }
                  />
                }
              />
              {SERIES.map((series) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={series.color}
                  strokeWidth={2}
                  dot={records.length < 16 ? { r: 3, strokeWidth: 0, fill: series.color } : false}
                  activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-line p-4">
        <p className="font-display text-[14px] font-semibold">Where they are now</p>
        <p className="text-[12px] text-muted">
          {latest ? `As of ${weekLabel(latest)}` : ""} · promoted in{" "}
          {promotedWeeks} of {records.length} weeks
        </p>
        <ul className="mt-4 space-y-3.5">
          {LANGUAGES.map((language, index) => {
            const level = latest?.final_belt_levels?.[language] ?? 0;
            const start = records[0]?.initial_belt_levels?.[language] ?? 0;
            return (
              <li key={language}>
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span className="font-semibold text-ink-2">
                    {LANGUAGE_LABELS[language]}
                  </span>
                  <span className="tabular-nums text-muted">
                    <span className="font-display text-[15px] font-bold text-ink">
                      {level}
                    </span>
                    {level > start ? (
                      <span className="ml-1.5 text-success-text">
                        +{level - start}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: LANGUAGE_COLORS[language] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(level / maxLevel) * 100}%` }}
                    transition={{
                      delay: 0.1 + index * 0.08,
                      type: "spring",
                      stiffness: 120,
                      damping: 20,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function WeeklyLog({ records }: { records: WeeklyRecord[] }) {
  if (!records.length)
    return <Empty message="No weekly belt records yet for this student." />;
  const newestFirst = [...records].reverse();
  return (
    <ol className="relative space-y-2.5 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-line">
      {newestFirst.map((record, index) => {
        const delta = gained(record);
        return (
          <motion.li
            key={`${recordKey(record)}-${record.start_time}-${index}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index, 10) * 0.03 }}
            className="relative grid grid-cols-[32px_1fr] gap-3"
          >
            <span
              className={`relative z-10 mt-2.5 grid h-[31px] w-[31px] place-items-center rounded-full border text-[10.5px] font-bold ${
                delta > 0
                  ? "border-success-line bg-success-soft text-success-text"
                  : "border-line bg-surface text-muted"
              }`}
            >
              {delta > 0 ? `+${delta}` : "·"}
            </span>
            <div className="rounded-xl border border-line bg-surface p-3 transition hover:border-line-strong hover:shadow-[var(--card-shadow)]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-[14px] font-semibold">
                  Week {record.week_number ?? "?"}
                  <span className="ml-1.5 text-[12px] font-normal text-muted">
                    {record.academic_year ?? ""}
                  </span>
                </p>
                <p className="text-[11.5px] text-muted">
                  {formatTimestamp(record.start_time)}
                  {record.belt_test_updated_at
                    ? ` · tested ${formatTimestamp(record.belt_test_updated_at)}`
                    : ""}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {LANGUAGES.map((language) => {
                  const before = record.initial_belt_levels?.[language];
                  const after = record.final_belt_levels?.[language];
                  if (after === undefined && before === undefined) return null;
                  const up =
                    typeof before === "number" &&
                    typeof after === "number" &&
                    after > before;
                  return (
                    <span
                      key={language}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] ${up ? "border-success-line bg-success-soft" : "border-line bg-surface-2"}`}
                    >
                      <LanguageLogo language={language} size={16} />
                      <span className="font-semibold text-ink-2">
                        {LANGUAGE_LABELS[language]}
                      </span>
                      <span className="tabular-nums text-muted">
                        {before ?? "—"}
                      </span>
                      <span className="text-faint">→</span>
                      <span
                        className={`font-bold tabular-nums ${up ? "text-success-text" : "text-ink"}`}
                      >
                        {after ?? "—"}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

function SquadTimeline({ memberships }: { memberships: Membership[] }) {
  if (!memberships.length)
    return <Empty message="No squad memberships recorded." />;
  const newestFirst = [...memberships].reverse();
  return (
    <ol className="relative ml-2 border-l border-dashed border-line-strong pl-6">
      {newestFirst.map((membership, index) => {
        const active = !membership.end_date;
        return (
          <motion.li
            key={`${membership.squad_number}-${membership.start_date}-${index}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className="relative pb-5 last:pb-0"
          >
            <span
              className={`absolute -left-[31px] top-1 grid h-3.5 w-3.5 place-items-center rounded-full border-2 ${active ? "border-success-text bg-success-soft" : "border-line-strong bg-surface"}`}
            >
              {active ? (
                <span className="dojo-anim h-1.5 w-1.5 animate-ping rounded-full bg-success-text" />
              ) : null}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-[15px] font-semibold">
                {membership.squad_number
                  ? `Squad ${membership.squad_number}`
                  : "Unknown squad"}
              </p>
              {active ? (
                <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-text">
                  Current
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {formatDate(membership.start_date)} →{" "}
              {active ? "present" : formatDate(membership.end_date)}
              {membership.start_date ? (
                <span className="ml-2 text-faint">
                  · {duration(membership.start_date, membership.end_date)}
                </span>
              ) : null}
            </p>
          </motion.li>
        );
      })}
    </ol>
  );
}

function duration(start: string, end: string | null) {
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(from) || Number.isNaN(to)) return "";
  const days = Math.max(0, Math.round((to - from) / 86_400_000));
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 70) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center text-sm text-muted">
      {message}
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="px-6 pb-6 pt-5" aria-busy="true">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-line p-3.5">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="mt-3 h-6 w-12" />
            <Skeleton className="mt-2 h-2.5 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-5 h-9 w-64 rounded-xl" />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border border-line p-4">
          <Skeleton className="h-4 w-40" />
          <div className="mt-4 flex h-48 items-end gap-2">
            {[40, 55, 48, 70, 62, 80, 76, 92].map((h, i) => (
              <Skeleton
                key={i}
                className="flex-1 rounded-md"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-4 rounded-2xl border border-line p-4">
          <Skeleton className="h-4 w-32" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
