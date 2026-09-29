"use client";

import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Minus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { CountUp } from "@/components/reactbits/count-up";
import { SpotlightCard } from "@/components/reactbits/spotlight-card";
import { ShinyButton } from "@/components/ui/shiny-button";
import {
  LANGUAGE_COLORS,
  ViewSelect,
  formatNumber,
} from "@/components/dashboard/chart-kit";
import {
  LANGUAGES,
  LANGUAGE_LABELS,
  groupsFor,
  rangeProgress,
  sum,
  type GroupBy,
  type Model,
  type RangeStatus,
  type StudentRange,
} from "@/lib/dashboard/metrics";
import { LanguageLogo } from "@/components/belts/belts";

type SortKey = "gain" | "end" | "name";
type StatusFilter = "all" | "improved" | "same" | "dropped" | "untested";

const STATUS_LABEL: Record<RangeStatus, string> = {
  improved: "Improved",
  same: "No change",
  dropped: "Dropped",
  untested: "Not tested",
  no_data: "No data",
};

const PAGE = 12;

/** Belts gained between any two weeks, with a per-student breakdown. */
export function RangeExplorer({ model, week }: { model: Model; week: number }) {
  const weeks = model.weekNumbers;
  const [from, setFrom] = useState(weeks[0] ?? week);
  const [to, setTo] = useState(week);
  const [scope, setScope] = useState("overall:all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("gain");
  const [expanded, setExpanded] = useState(false);

  const canSplitUniversity =
    model.data.role === "super_admin" && model.multiUniversity;
  const scopeOptions = [
    { value: "overall:all", label: "All students" },
    ...groupsFor(model, "squad").map((group) => ({
      value: `squad:${group.key}`,
      label: group.label,
    })),
    ...(canSplitUniversity
      ? groupsFor(model, "university").map((group) => ({
          value: `university:${group.key}`,
          label: group.label,
        }))
      : []),
  ];
  const [scopeGroup, scopeKey] = scope.split(":") as [GroupBy, string];
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const range = useMemo(
    () => rangeProgress(model, low, high, scopeGroup, scopeKey),
    [model, low, high, scopeGroup, scopeKey],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return range.students
      .filter((student) =>
        status === "all"
          ? true
          : status === "untested"
            ? student.status === "untested" || student.status === "no_data"
            : student.status === status,
      )
      .filter(
        (student) => !needle || student.name.toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "end") return sum(b.end ?? []) - sum(a.end ?? []);
        return b.gain - a.gain || sum(b.end ?? []) - sum(a.end ?? []);
      });
  }, [range, query, status, sort]);

  const visible = expanded ? rows : rows.slice(0, PAGE);
  const maxLanguageGain = Math.max(1, ...range.languageGain.map(Math.abs));
  const canOpenHistory = model.data.role !== "mentor";

  function preset(span: number | "all") {
    const endIndex = weeks.indexOf(week);
    const startIndex = span === "all" ? 0 : Math.max(0, endIndex - span);
    setFrom(weeks[startIndex]);
    setTo(week);
  }

  function exportCsv() {
    const header = [
      "Student",
      "Squad",
      "Start week",
      "Start belts",
      "End week",
      "End belts",
      "Gain",
      ...LANGUAGES.map((language) => `${LANGUAGE_LABELS[language]} gain`),
      "Tests in range",
      "Status",
    ];
    const lines = rows.map((student) =>
      [
        student.name,
        model.squadLabel.get(student.squadId) ?? "",
        student.startWeek ?? "",
        student.start ? sum(student.start) : "",
        student.endWeek ?? "",
        student.end ? sum(student.end) : "",
        student.gain,
        ...student.languageGain,
        student.tests,
        STATUS_LABEL[student.status],
      ]
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `belt-progress-week-${low}-to-${high}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const stats = [
    {
      label: "Belts gained",
      value: range.beltsGained,
      prefix: range.beltsGained > 0 ? "+" : "",
      detail: `Week ${low} → Week ${high}`,
    },
    {
      label: "Students improved",
      value: range.improved,
      detail: `of ${range.tested} tested in range`,
    },
    {
      label: "Avg gain per student",
      value: range.avgGain ?? 0,
      decimals: 2,
      prefix: (range.avgGain ?? 0) > 0 ? "+" : "",
      detail: "Across students tested in range",
    },
    {
      label: "Dropped",
      value: range.dropped,
      detail: `${range.same} unchanged · ${range.untested} not tested`,
    },
  ];

  return (
    <section className="rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)]">
      {/* Header & range controls */}
      <div className="flex flex-col gap-4 border-b border-line px-5 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-6">
        <div>
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em]">
            Progress between weeks
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Belts each student gained from one week to another.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex rounded-lg bg-ink/[0.045] p-0.5">
            {(
              [
                ["Last week", 1],
                ["Last 4 weeks", 4],
                ["Whole year", "all"],
              ] as const
            ).map(([label, span]) => (
              <button
                key={label}
                type="button"
                onClick={() => preset(span)}
                className="rounded-md px-2.5 py-1 font-display text-[12.5px] font-semibold text-muted transition hover:bg-surface hover:text-ink"
              >
                {label}
              </button>
            ))}
          </div>
          <ViewSelect
            label="From"
            value={String(from)}
            options={weeks.map((item) => ({
              value: String(item),
              label: `Week ${item}`,
            }))}
            onChange={(value) => setFrom(Number(value))}
          />
          <ViewSelect
            label="To"
            value={String(to)}
            options={weeks.map((item) => ({
              value: String(item),
              label: `Week ${item}`,
            }))}
            onChange={(value) => setTo(Number(value))}
          />
          <ViewSelect
            label="Scope"
            value={scope}
            options={scopeOptions}
            onChange={setScope}
          />
        </div>
      </div>

      {/* Totals */}
      <div className="grid gap-3 px-5 pt-5 sm:grid-cols-2 xl:grid-cols-4 lg:px-6">
        {stats.map((stat) => (
          <SpotlightCard key={stat.label} className="p-4">
            <p className="text-[12.5px] font-medium text-muted">{stat.label}</p>
            <p className="mt-1.5 font-display text-[28px] font-bold leading-none tracking-[-0.03em] text-ink">
              <CountUp
                key={`${low}-${high}-${scope}-${stat.value}`}
                to={stat.value}
                decimals={stat.decimals ?? 0}
                prefix={stat.prefix}
              />
            </p>
            <p className="mt-2 text-[12px] text-muted">{stat.detail}</p>
          </SpotlightCard>
        ))}
      </div>

      {/* Per-language gains */}
      <div className="grid gap-x-8 gap-y-3 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
        {LANGUAGES.map((language, index) => {
          const value = range.languageGain[index];
          return (
            <div key={language}>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <LanguageLogo language={language} size={16} />
                  {LANGUAGE_LABELS[language]}
                </span>
                <span className="font-semibold tabular-nums text-ink">
                  {value > 0 ? "+" : ""}
                  {value}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{
                    width: `${(Math.abs(value) / maxLanguageGain) * 100}%`,
                    background: LANGUAGE_COLORS[language],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Student table controls */}
      <div className="flex flex-col gap-3 border-t border-line px-5 py-4 md:flex-row md:items-center md:justify-between lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search students</span>
            <Search
              size={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search students"
              className="h-8 w-52 rounded-lg border border-line bg-surface pl-8 pr-3 text-[13px] text-ink outline-none transition placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ink/10"
            />
          </label>
          <div className="flex rounded-lg bg-ink/[0.045] p-0.5">
            {(
              [
                ["all", "All"],
                ["improved", "Improved"],
                ["same", "No change"],
                ["dropped", "Dropped"],
                ["untested", "Not tested"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
                className={`rounded-md px-2.5 py-1 font-display text-[12.5px] font-semibold transition ${
                  status === value
                    ? "bg-surface text-ink shadow-[var(--card-shadow)] ring-[0.5px] ring-line"
                    : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <ViewSelect
            label="Sort"
            value={sort}
            options={[
              { value: "gain", label: "Most gained" },
              { value: "end", label: "Most belts" },
              { value: "name", label: "Name" },
            ]}
            onChange={setSort}
          />
          <ShinyButton
            onClick={exportCsv}
            className="h-8 px-3.5 font-display text-[12.5px] font-semibold"
          >
            <Download size={14} />
            Export CSV
          </ShinyButton>
        </div>
      </div>

      {/* Student table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[13.5px]">
          <thead className="text-[11.5px] font-medium text-muted">
            <tr className="border-y border-line bg-surface-2">
              <th className="px-5 py-2.5 font-medium lg:px-6">Student</th>
              <th className="px-4 py-2.5 text-right font-medium">Start</th>
              <th className="px-4 py-2.5 text-right font-medium">End</th>
              <th className="px-4 py-2.5 text-right font-medium">Gain</th>
              <th className="px-4 py-2.5 font-medium">By language</th>
              <th className="px-5 py-2.5 text-right font-medium lg:px-6">
                Tests
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-muted">
                  No students match.
                </td>
              </tr>
            ) : (
              visible.map((student) => (
                <StudentRow
                  key={student.studentId}
                  student={student}
                  squad={model.squadLabel.get(student.squadId) ?? "—"}
                  canOpenHistory={canOpenHistory}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-5 py-3.5 text-[12.5px] text-muted lg:px-6">
        <span>
          Showing {visible.length} of {rows.length} students
        </span>
        {rows.length > PAGE && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="font-display font-semibold text-ink-2 hover:text-ink"
          >
            {expanded ? "Show less" : `Show all ${rows.length}`}
          </button>
        )}
      </div>
    </section>
  );
}

function StudentRow({
  student,
  squad,
  canOpenHistory,
}: {
  student: StudentRange;
  squad: string;
  canOpenHistory: boolean;
}) {
  const start = student.start ? sum(student.start) : null;
  const end = student.end ? sum(student.end) : null;
  const changed = LANGUAGES.map((language, index) => ({
    language,
    value: student.languageGain[index],
  })).filter((item) => item.value !== 0);

  return (
    <tr className="hover:bg-surface-2">
      <td className="px-5 py-3 lg:px-6">
        {canOpenHistory ? (
          <Link
            href={`/students/${student.studentId}/history`}
            className="font-display font-semibold text-ink hover:underline"
          >
            {student.name}
          </Link>
        ) : (
          <span className="font-display font-semibold text-ink">
            {student.name}
          </span>
        )}
        <span className="block text-[12px] text-muted">
          {squad}
          {student.joinedInRange && " · first test in range"}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-2">
        {start === null ? (
          "—"
        ) : (
          <>
            {start}
            <span className="ml-1 text-[11.5px] text-faint">
              W{student.startWeek}
            </span>
          </>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-2">
        {end === null ? (
          "—"
        ) : (
          <>
            {end}
            <span className="ml-1 text-[11.5px] text-faint">
              W{student.endWeek}
            </span>
          </>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {student.status === "untested" || student.status === "no_data" ? (
          <span className="text-[12.5px] text-faint">
            {STATUS_LABEL[student.status]}
          </span>
        ) : (
          <span
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold tabular-nums ${
              student.gain > 0
                ? "bg-success-soft text-success-text"
                : student.gain < 0
                  ? "bg-brand-soft text-brand-text"
                  : "bg-ink/[0.05] text-muted"
            }`}
          >
            {student.gain > 0 ? (
              <ArrowUpRight size={13} />
            ) : student.gain < 0 ? (
              <ArrowDownRight size={13} />
            ) : (
              <Minus size={13} />
            )}
            {Math.abs(student.gain)}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {changed.length === 0 ? (
          <span className="text-[12.5px] text-faint">—</span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {changed.map((item) => (
              <span
                key={item.language}
                className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[12px] text-ink-2"
              >
                <LanguageLogo language={item.language} size={16} />
                {LANGUAGE_LABELS[item.language]}
                <span className="font-semibold tabular-nums text-ink">
                  {item.value > 0 ? "+" : ""}
                  {item.value}
                </span>
              </span>
            ))}
          </span>
        )}
      </td>
      <td className="px-5 py-3 text-right tabular-nums text-muted lg:px-6">
        {formatNumber(student.tests)}
      </td>
    </tr>
  );
}
