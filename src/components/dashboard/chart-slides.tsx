"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
  type PieSectorShapeProps,
} from "recharts";
import {
  AXIS_TICK,
  CHART,
  ChartLegend,
  ChartTooltip,
  EmptyChart,
  LANGUAGE_COLORS,
  MAX_SERIES,
  OTHER_COLOR,
  STATUS_COLORS,
  ViewSelect,
  colorFor,
  formatNumber,
  type SeriesKey,
} from "@/components/dashboard/chart-kit";
import type { Slide } from "@/components/dashboard/chart-carousel";
import {
  LANGUAGES,
  LANGUAGE_LABELS,
  beltShare,
  groupComparison,
  groupsFor,
  levelDistribution,
  movement,
  sum,
  trend,
  type GroupBy,
  type Language,
  type Model,
  type TrendMetric,
} from "@/lib/dashboard/metrics";

const CHART_HEIGHT = 300;

const METRIC_OPTIONS: Array<{ value: TrendMetric; label: string }> = [
  { value: "avgBelts", label: "Avg belts per student" },
  { value: "totalBelts", label: "Total belts" },
  { value: "coverage", label: "Students tested (%)" },
];

function formatMetric(metric: TrendMetric, value: number | null) {
  if (value === null) return "—";
  if (metric === "coverage") return `${formatNumber(value, 0)}%`;
  if (metric === "avgBelts") return formatNumber(value, 2);
  return formatNumber(value);
}

const weekLabel = (week: string | number | undefined) => `Week ${week}`;

/** Fold everything past the palette into a single "Other" slice. */
function foldOther<T extends { key: string; label: string; value: number }>(
  items: T[],
) {
  if (items.length <= MAX_SERIES)
    return items.map((item, index) => ({
      ...item,
      color: colorFor(item.key, index),
    }));
  const head = items.slice(0, MAX_SERIES - 1).map((item, index) => ({
    ...item,
    color: colorFor(item.key, index),
  }));
  const rest = items.slice(MAX_SERIES - 1);
  return [
    ...head,
    {
      key: "other",
      label: `Other (${rest.length})`,
      value: sum(rest.map((item) => item.value)),
      color: OTHER_COLOR,
    },
  ];
}

function sectorShape(props: PieSectorShapeProps) {
  // Recharts passes `key` inside props; React needs it passed directly.
  const { key, ...rest } = props as PieSectorShapeProps & { key?: string };
  const fill = (rest.payload as { color?: string } | undefined)?.color;
  return (
    <Sector
      key={key}
      {...rest}
      fill={fill}
      stroke="var(--surface)"
      strokeWidth={2}
    />
  );
}

export function useChartSlides(model: Model, week: number): Slide[] {
  const isSuperAdmin = model.data.role === "super_admin";
  const canSplitUniversity = isSuperAdmin && model.multiUniversity;

  const [trendMetric, setTrendMetric] = useState<TrendMetric>("avgBelts");
  const [trendGroup, setTrendGroup] = useState<GroupBy>("overall");
  const [levelLanguage, setLevelLanguage] = useState<Language | "all">("all");
  const [shareSplit, setShareSplit] =
    useState<Exclude<GroupBy, "overall">>("language");
  const [compareBy, setCompareBy] = useState<"squad" | "university">("squad");
  const [movementScope, setMovementScope] = useState("overall:all");

  const groupOptions: Array<{
    value: GroupBy;
    label: string;
    disabled?: boolean;
  }> = [
    { value: "overall", label: "Overall" },
    {
      value: "language",
      label: "Language",
      disabled: trendMetric === "coverage",
    },
    { value: "squad", label: "Squad" },
    ...(canSplitUniversity
      ? [{ value: "university" as const, label: "University" }]
      : []),
  ];

  // ── 1. Progress over time ──────────────────────────────────────────────────
  const effectiveTrendGroup =
    trendMetric === "coverage" && trendGroup === "language"
      ? "overall"
      : !canSplitUniversity && trendGroup === "university"
        ? "overall"
        : trendGroup;
  const trendData = trend(model, trendMetric, effectiveTrendGroup);
  const trendSeries: SeriesKey[] = trendData.groups
    .slice(0, MAX_SERIES)
    .map((group, index) => ({
      key: group.key,
      label: group.label,
      color:
        effectiveTrendGroup === "overall"
          ? "var(--ink-2)"
          : colorFor(group.key, index),
    }));
  const trendHidden = trendData.groups.length - trendSeries.length;
  const trendTooltip = (
    <Tooltip
      cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
      content={
        <ChartTooltip
          series={trendSeries}
          formatLabel={weekLabel}
          formatValue={(value) => formatMetric(trendMetric, value)}
        />
      }
    />
  );
  const trendAxes = (
    <>
      <CartesianGrid vertical={false} stroke={CHART.grid} />
      <XAxis
        dataKey="week"
        tickFormatter={(week) => `W${week}`}
        tick={AXIS_TICK}
        axisLine={{ stroke: CHART.axis }}
        tickLine={false}
        padding={{ left: 12, right: 12 }}
      />
      <YAxis
        tick={AXIS_TICK}
        axisLine={false}
        tickLine={false}
        width={44}
        allowDecimals={trendMetric === "avgBelts"}
        domain={trendMetric === "coverage" ? [0, 100] : [0, "auto"]}
        tickFormatter={(value: number) =>
          trendMetric === "coverage"
            ? `${value}%`
            : formatNumber(value, trendMetric === "avgBelts" ? 1 : 0)
        }
      />
    </>
  );
  const trendChart =
    model.weekNumbers.length === 0 ? (
      <EmptyChart>No imported weeks for this academic year yet.</EmptyChart>
    ) : (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        {trendSeries.length === 1 ? (
          <AreaChart
            data={trendData.rows}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            {trendAxes}
            {trendTooltip}
            <Area
              type="monotone"
              dataKey={trendSeries[0].key}
              stroke={trendSeries[0].color}
              strokeWidth={2}
              fill={trendSeries[0].color}
              fillOpacity={0.1}
              dot={{
                r: 4,
                fill: trendSeries[0].color,
                stroke: "var(--surface)",
                strokeWidth: 2,
              }}
              activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        ) : (
          <LineChart
            data={trendData.rows}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            {trendAxes}
            {trendTooltip}
            {trendSeries.map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                stroke={series.color}
                strokeWidth={2}
                dot={{
                  r: 4,
                  fill: series.color,
                  stroke: "var(--surface)",
                  strokeWidth: 2,
                }}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    );

  // ── 2. Belt levels ─────────────────────────────────────────────────────────
  const levels = levelDistribution(model, week, levelLanguage);
  const levelColor =
    levelLanguage === "all" ? "var(--ink-2)" : LANGUAGE_COLORS[levelLanguage];
  const levelTested = sum(levels.map((row) => row.students));
  const levelChart =
    levelTested === 0 ? (
      <EmptyChart>No students were tested in Week {week}.</EmptyChart>
    ) : (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart
          data={levels}
          margin={{ top: 20, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="level"
            tick={AXIS_TICK}
            axisLine={{ stroke: CHART.axis }}
            tickLine={false}
            tickFormatter={(level) =>
              levelLanguage === "all" ? `${level}` : `L${level}`
            }
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={44}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "color-mix(in srgb, var(--ink) 4%, transparent)" }}
            content={
              <ChartTooltip
                formatLabel={(level) =>
                  levelLanguage === "all"
                    ? `${level} belts in total`
                    : `${LANGUAGE_LABELS[levelLanguage]} level ${level}`
                }
                formatValue={(value) => `${formatNumber(value)} students`}
                series={[
                  { key: "students", label: "Students", color: levelColor },
                ]}
              />
            }
          />
          <Bar
            dataKey="students"
            fill={levelColor}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
            isAnimationActive={false}
            label={{ position: "top", fill: CHART.secondary, fontSize: 12 }}
          />
        </BarChart>
      </ResponsiveContainer>
    );

  // ── 3. Share of belts ──────────────────────────────────────────────────────
  const effectiveShareSplit =
    !canSplitUniversity && shareSplit === "university"
      ? "language"
      : shareSplit;
  const share = foldOther(beltShare(model, week, effectiveShareSplit));
  const shareTotal = sum(share.map((item) => item.value));
  const shareVisible = share.filter((item) => item.value > 0);
  const shareChart =
    shareTotal === 0 ? (
      <EmptyChart>No belts held yet in Week {week}.</EmptyChart>
    ) : (
      <div className="relative">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <PieChart>
            <Tooltip
              content={
                <ChartTooltip
                  series={share.map((item) => ({
                    key: item.label,
                    label: item.label,
                    color: item.color,
                  }))}
                  formatValue={(value) =>
                    value === null
                      ? "—"
                      : `${formatNumber(value)} · ${formatNumber((value / shareTotal) * 100, 0)}%`
                  }
                />
              }
            />
            <Pie
              data={shareVisible}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              shape={sectorShape}
              isAnimationActive={false}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[28px] font-bold tracking-[-0.03em] text-ink">
            {formatNumber(shareTotal)}
          </span>
          <span className="text-[12px] text-muted">belts held</span>
        </div>
      </div>
    );

  // ── 4. Compare groups ──────────────────────────────────────────────────────
  const effectiveCompareBy = canSplitUniversity ? compareBy : "squad";
  const comparison = groupComparison(model, week, effectiveCompareBy);
  const languageSeries: SeriesKey[] = LANGUAGES.map((language) => ({
    key: language,
    label: LANGUAGE_LABELS[language],
    color: LANGUAGE_COLORS[language],
  }));
  const comparisonHasBelts = comparison.some((row) =>
    LANGUAGES.some((language) => Number(row[language]) > 0),
  );
  const compareChart =
    comparison.length === 0 ? (
      <EmptyChart>No squads with students yet.</EmptyChart>
    ) : !comparisonHasBelts ? (
      <EmptyChart>No belts held yet in Week {week}.</EmptyChart>
    ) : (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart
          data={comparison}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={{ stroke: CHART.axis }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(value: number) => formatNumber(value, 1)}
          />
          <Tooltip
            cursor={{ fill: "color-mix(in srgb, var(--ink) 4%, transparent)" }}
            content={
              <ChartTooltip
                series={languageSeries}
                formatValue={(value) => formatNumber(value, 2)}
              />
            }
          />
          {languageSeries.map((series, index) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              stackId="languages"
              fill={series.color}
              stroke="var(--surface)"
              strokeWidth={2}
              maxBarSize={40}
              radius={index === languageSeries.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );

  // ── 5. Weekly movement ─────────────────────────────────────────────────────
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
  const validScope = scopeOptions.some(
    (option) => option.value === movementScope,
  )
    ? movementScope
    : "overall:all";
  const [scopeGroup, scopeKey] = validScope.split(":") as [GroupBy, string];
  const moves = movement(model, week, scopeGroup, scopeKey);
  const movementSlices = [
    { key: "up", label: "Moved up", value: moves.up, color: STATUS_COLORS.up },
    {
      key: "same",
      label: "No change",
      value: moves.same,
      color: STATUS_COLORS.same,
    },
    {
      key: "down",
      label: "Moved down",
      value: moves.down,
      color: STATUS_COLORS.down,
    },
    {
      key: "first",
      label: "First record",
      value: moves.first,
      color: STATUS_COLORS.first,
    },
    {
      key: "untested",
      label: "Not tested",
      value: moves.untested,
      color: STATUS_COLORS.untested,
    },
  ];
  const movementTotal = sum(movementSlices.map((slice) => slice.value));
  const movementChart =
    movementTotal === 0 ? (
      <EmptyChart>No students in this scope.</EmptyChart>
    ) : (
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <PieChart>
            <Tooltip
              content={
                <ChartTooltip
                  series={movementSlices.map((slice) => ({
                    key: slice.label,
                    label: slice.label,
                    color: slice.color,
                  }))}
                  formatValue={(value) =>
                    value === null
                      ? "—"
                      : `${formatNumber(value)} · ${formatNumber((value / movementTotal) * 100, 0)}%`
                  }
                />
              }
            />
            <Pie
              data={movementSlices.filter((slice) => slice.value > 0)}
              dataKey="value"
              nameKey="label"
              outerRadius="92%"
              shape={sectorShape}
              isAnimationActive={false}
            />
          </PieChart>
        </ResponsiveContainer>
        <ul className="space-y-2.5 text-[13px]">
          {movementSlices.map((slice) => (
            <li
              key={slice.key}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2 text-ink-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: slice.color }}
                />
                {slice.label}
              </span>
              <span className="tabular-nums text-ink">
                <span className="font-semibold">
                  {formatNumber(slice.value)}
                </span>
                <span className="ml-1.5 text-muted">
                  {formatNumber((slice.value / movementTotal) * 100, 0)}%
                </span>
              </span>
            </li>
          ))}
          <li className="border-t border-line pt-2.5 text-[12.5px] text-muted">
            Net change:{" "}
            <span className="font-semibold text-ink">
              {moves.beltsGained > 0 ? "+" : ""}
              {formatNumber(moves.beltsGained)} belts
            </span>
          </li>
        </ul>
      </div>
    );

  return [
    {
      key: "trend",
      title: "Progress over time",
      subtitle:
        trendHidden > 0
          ? `Showing ${trendSeries.length} of ${trendData.groups.length} — see the table for all`
          : `${METRIC_OPTIONS.find((option) => option.value === trendMetric)?.label} each week`,
      controls: (
        <>
          <ViewSelect
            label="Metric"
            value={trendMetric}
            options={METRIC_OPTIONS}
            onChange={setTrendMetric}
          />
          <ViewSelect
            label="By"
            value={effectiveTrendGroup}
            options={groupOptions}
            onChange={setTrendGroup}
          />
        </>
      ),
      legend: <ChartLegend series={trendSeries} />,
      chart: trendChart,
      table: {
        columns: ["Week", ...trendData.groups.map((group) => group.label)],
        rows: trendData.rows.map((row) => [
          weekLabel(row.week ?? undefined),
          ...trendData.groups.map((group) =>
            formatMetric(trendMetric, row[group.key] ?? null),
          ),
        ]),
      },
    },
    {
      key: "levels",
      title: "Belt levels",
      subtitle: `How many students sit at each level · Week ${week}`,
      controls: (
        <ViewSelect
          label="Language"
          value={levelLanguage}
          options={[
            { value: "all", label: "All (total belts)" },
            ...LANGUAGES.map((language) => ({
              value: language,
              label: LANGUAGE_LABELS[language],
            })),
          ]}
          onChange={setLevelLanguage}
        />
      ),
      chart: levelChart,
      table: {
        columns: [
          levelLanguage === "all" ? "Total belts" : "Level",
          "Students",
        ],
        rows: levels.map((row) => [row.level, row.students]),
      },
    },
    {
      key: "share",
      title: "Where the belts are",
      subtitle: `Share of all belts held · Week ${week}`,
      controls: (
        <ViewSelect
          label="Split by"
          value={effectiveShareSplit}
          options={[
            { value: "language", label: "Language" },
            { value: "squad", label: "Squad" },
            ...(canSplitUniversity
              ? [{ value: "university" as const, label: "University" }]
              : []),
          ]}
          onChange={setShareSplit}
        />
      ),
      legend: (
        <ChartLegend
          series={share.map((item) => ({
            key: item.key,
            label: item.label,
            color: item.color,
          }))}
        />
      ),
      chart: shareChart,
      table: {
        columns: ["Group", "Belts", "Share"],
        rows: share.map((item) => [
          item.label,
          formatNumber(item.value),
          shareTotal
            ? `${formatNumber((item.value / shareTotal) * 100, 1)}%`
            : "—",
        ]),
      },
    },
    {
      key: "compare",
      title: canSplitUniversity ? "Compare groups" : "Compare squads",
      subtitle: `Average belts per tested student, by language · Week ${week}`,
      controls: canSplitUniversity ? (
        <ViewSelect
          label="Compare"
          value={effectiveCompareBy}
          options={[
            { value: "squad", label: "Squads" },
            { value: "university", label: "Universities" },
          ]}
          onChange={setCompareBy}
        />
      ) : null,
      legend: <ChartLegend series={languageSeries} />,
      chart: compareChart,
      table: {
        columns: [
          effectiveCompareBy === "squad" ? "Squad" : "University",
          "Tested",
          ...languageSeries.map((series) => series.label),
          "Avg total",
        ],
        rows: comparison.map((row) => [
          String(row.label),
          `${row.tested}/${row.students}`,
          ...LANGUAGES.map((language) =>
            formatNumber(Number(row[language]), 2),
          ),
          formatNumber(
            sum(LANGUAGES.map((language) => Number(row[language]))),
            2,
          ),
        ]),
      },
    },
    {
      key: "movement",
      title: "Weekly movement",
      subtitle: `Change since each student's previous test · Week ${week}`,
      controls: (
        <ViewSelect
          label="Scope"
          value={validScope}
          options={scopeOptions}
          onChange={setMovementScope}
        />
      ),
      chart: movementChart,
      table: {
        columns: ["Status", "Students", "Share"],
        rows: movementSlices.map((slice) => [
          slice.label,
          slice.value,
          `${formatNumber((slice.value / (movementTotal || 1)) * 100, 1)}%`,
        ]),
      },
    },
  ];
}
