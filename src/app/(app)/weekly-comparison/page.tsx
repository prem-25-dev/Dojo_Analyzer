"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  ChevronDown,
  Download,
  Rocket,
  Search,
  SearchX,
  X,
} from "lucide-react";
import {
  getCurrentUserProfile,
  type CurrentUserProfile,
} from "@/lib/auth/profile";
import { formatWeekLabel } from "@/lib/weeks";
import { PageState as AccountState } from "@/components/ui/skeleton";
import { DojoLoader } from "@/components/ui/dojo-loader";
import { ShinyButton } from "@/components/ui/shiny-button";
import { PillSelect, RingStat, ShareBar } from "@/components/insights/kit";
import { StudentAvatar } from "@/components/students/avatar";
import { HistoryDialog } from "@/components/students/history-dialog";
import type { Student } from "@/components/students/types";
import { LANGUAGES, LANGUAGE_LABELS } from "@/lib/dashboard/metrics";
import { LanguageLogo } from "@/components/belts/belts";
import { useCachedProfile } from "@/lib/auth/use-cached-profile";

type ComparisonStatus = "improved" | "no_change" | "missing_data";
type VisibleStatus = "none" | ComparisonStatus | "decreased";
type LanguagePair = { from: number | null; to: number | null };

type Comparison = {
  student_id: string;
  student_name: string | null;
  email: string | null;
  university_id: string | null;
  university_name: string | null;
  squad_id: string | null;
  squad_number: string | null;
  from_total: number | null;
  to_total: number | null;
  net_change: number | null;
  status: ComparisonStatus;
  languages: {
    java: LanguagePair;
    nodejs: LanguagePair;
    python: LanguagePair;
    cpp: LanguagePair;
  };
};

type Week = {
  id: string;
  week_number: number | null;
  academic_year: number | null;
  start_date: string | null;
  end_date: string | null;
};
type University = { id: string; name: string };
type Squad = { id: string; number: string };
type Summary = {
  total: number;
  improved: number;
  no_change: number;
  missing_data: number;
};
type ComparisonResponse = {
  from_week?: Week;
  to_week?: Week;
  summary?: Summary;
  comparisons?: Comparison[];
  error?: string;
};
type PeriodsResponse = {
  weeks?: Array<{
    week_id: string;
    week_number: number | null;
    academic_year: number | null;
    start_date: string | null;
    end_date: string | null;
  }>;
  error?: string;
};

const STATUS_META: Record<Exclude<VisibleStatus, "none">, { label: string; color: string; badge: string }> = {
  improved: { label: "Improved", color: "var(--status-up)", badge: "bg-success-soft text-success-text" },
  no_change: { label: "No change", color: "var(--status-same)", badge: "bg-sunken text-muted" },
  missing_data: { label: "Missing data", color: "var(--series-4)", badge: "bg-warning-soft text-warning-text" },
  decreased: { label: "Decreased", color: "var(--status-down)", badge: "bg-brand-soft text-brand-text" },
};

const PAGE = 50;

export default function WeeklyComparisonPage() {
  return (
    <Suspense fallback={<AccountState message="Loading weekly comparison" loading />}>
      <WeeklyComparisonContent />
    </Suspense>
  );
}

function WeeklyComparisonContent() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const searchParams = useSearchParams();
  const cachedProfile = useCachedProfile();
  const [profileState, setProfileState] = useState<
    CurrentUserProfile | { status: "loading" }
  >(cachedProfile ?? { status: "loading" });
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [fromWeekId, setFromWeekId] = useState(searchParams.get("from_week_id") ?? "");
  const [toWeekId, setToWeekId] = useState(searchParams.get("to_week_id") ?? "");
  const [universityId, setUniversityId] = useState("");
  const [squadId, setSquadId] = useState("");
  const [status, setStatus] = useState<VisibleStatus>(
    searchParams.get("change") === "decreased" ? "decreased" : "none",
  );
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [universities, setUniversities] = useState<University[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [historyFor, setHistoryFor] = useState<Student | null>(null);

  useEffect(() => {
    let mounted = true;
    getCurrentUserProfile().then((result) => {
      if (mounted) setProfileState(result);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (profileState.status === "unauthenticated") router.replace("/login");
    if (profileState.status === "authenticated" && profileState.profile.role === "student")
      router.replace("/student");
  }, [profileState, router]);

  useEffect(() => {
    if (profileState.status !== "authenticated") return;
    const controller = new AbortController();
    async function loadWeeks() {
      try {
        const periodQuery = universityId
          ? `?university_id=${encodeURIComponent(universityId)}`
          : "";
        const response = await fetch(`/api/dashboard/periods${periodQuery}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = (await response.json()) as PeriodsResponse;
        const unique = new Map<string, Week>();
        for (const item of result.weeks ?? []) {
          const key = `${item.academic_year}:${item.week_number}`;
          if (!unique.has(key))
            unique.set(key, {
              id: item.week_id,
              week_number: item.week_number,
              academic_year: item.academic_year,
              start_date: item.start_date,
              end_date: item.end_date,
            });
        }
        const ordered = Array.from(unique.values()).sort(
          (left, right) =>
            (right.academic_year ?? 0) - (left.academic_year ?? 0) ||
            (right.week_number ?? 0) - (left.week_number ?? 0),
        );
        setWeeks(ordered);
        setFromWeekId((current) =>
          ordered.some((week) => week.id === current)
            ? current
            : ordered[1]?.id || ordered[0]?.id || "",
        );
        setToWeekId((current) =>
          ordered.some((week) => week.id === current) ? current : ordered[0]?.id || "",
        );
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError"))
          setError("Unable to load available weeks.");
      }
    }
    loadWeeks();
    return () => controller.abort();
  }, [profileState, universityId]);

  useEffect(() => {
    if (profileState.status !== "authenticated" || profileState.profile.role !== "super_admin")
      return;
    const controller = new AbortController();
    fetch("/api/super-admin/universities", { signal: controller.signal })
      .then((response) => response.json())
      .then((result: { universities?: University[] }) =>
        setUniversities(result.universities ?? []),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [profileState]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (profileState.status !== "authenticated" || !fromWeekId || !toWeekId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      from_week_id: fromWeekId,
      to_week_id: toWeekId,
      status: status === "none" || status === "decreased" ? "all" : status,
    });
    if (universityId) query.set("university_id", universityId);
    if (squadId) query.set("squad_id", squadId);
    if (search) query.set("search", search);

    async function loadComparison() {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/weekly-comparison?${query}`, {
          signal: controller.signal,
        });
        const result = (await response.json()) as ComparisonResponse;
        if (!response.ok)
          throw new Error(result.error ?? "Unable to load weekly comparison.");
        const rows = (result.comparisons ?? []).filter(
          (row) =>
            row.status === "improved" ||
            row.status === "no_change" ||
            row.status === "missing_data",
        );
        const visibleRows =
          status === "decreased"
            ? rows.filter((row) => row.net_change !== null && row.net_change < 0)
            : rows;
        setComparisons(sortDisplayedRows(visibleRows, status));
        setSummary(status === "decreased" ? null : (result.summary ?? null));
        setUniversities((current) => mergeUniversities(current, visibleRows));
        setSquads((current) => mergeSquads(current, visibleRows));
        setLimit(PAGE);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load weekly comparison.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    loadComparison();
    return () => controller.abort();
  }, [fromWeekId, profileState, search, status, toWeekId, universityId, squadId]);

  const rows = useMemo(() => comparisons ?? [], [comparisons]);
  const climbers = useMemo(
    () => rows.filter((row) => (row.net_change ?? 0) > 0).slice(0, 5),
    [rows],
  );
  const distribution = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of rows) {
      if (row.net_change === null) continue;
      counts.set(row.net_change, (counts.get(row.net_change) ?? 0) + 1);
    }
    const keys = [...counts.keys()];
    if (!keys.length) return [];
    const min = Math.min(0, ...keys);
    const max = Math.max(0, ...keys);
    return Array.from({ length: max - min + 1 }, (_, i) => ({
      change: min + i,
      count: counts.get(min + i) ?? 0,
    }));
  }, [rows]);

  function exportCsv() {
    const headers = ["Student", "Email", "University", "Squad", "From Total", "To Total", "Change", "Status", "Java", "Node.js", "Python", "C++"];
    const body = rows.map((row) => [
      row.student_name,
      row.email,
      row.university_name,
      row.squad_number,
      row.from_total,
      row.to_total,
      row.net_change === null ? "" : row.net_change,
      status === "decreased" ? "decreased" : row.status,
      formatPair(row.languages.java),
      formatPair(row.languages.nodejs),
      formatPair(row.languages.python),
      formatPair(row.languages.cpp),
    ]);
    const csv = [headers, ...body].map((row) => row.map(csvValue).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "weekly-comparison.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (profileState.status === "loading")
    return <AccountState message="Checking your account" loading />;
  if (profileState.status === "unauthenticated")
    return <AccountState message="Redirecting to login" loading />;
  if (profileState.status === "unassigned")
    return (
      <AccountState
        message="Account not assigned"
        detail="Your account does not have an assigned profile yet."
      />
    );
  if (profileState.status === "invalid_role")
    return <AccountState message="Account role not supported" />;
  if (profileState.status === "error")
    return <AccountState message="Unable to load your account" detail={profileState.message} />;
  const currentProfile =
    profileState.status === "authenticated" ? profileState.profile : null;
  if (!currentProfile) return <AccountState message="Unable to determine your account role" />;
  if (currentProfile.role === "student")
    return <AccountState message="Redirecting to your student area" loading />;

  const fromWeek = weeks.find((week) => week.id === fromWeekId);
  const toWeek = weeks.find((week) => week.id === toWeekId);
  const canSeeDecreased = currentProfile.role === "campus_manager" || status === "decreased";
  const statusChoices: VisibleStatus[] = ["none", "improved", "no_change", "missing_data", ...(canSeeDecreased ? (["decreased"] as const) : [])];
  const firstLoad = comparisons === null && !error;

  function openHistory(row: Comparison) {
    setHistoryFor({
      id: row.student_id,
      name: row.student_name,
      email: row.email,
      squad_id: row.squad_id,
      squad_number: row.squad_number,
      university_name: row.university_name,
      start_date: null,
      end_date: null,
    });
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-16 lg:px-8">
      {/* ── Hero with the week range ─────────────────────── */}
      <section className="relative mt-2 overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--card-shadow)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(45% 140% at 100% 0%, color-mix(in srgb, var(--status-up) 12%, transparent), transparent 60%), radial-gradient(45% 120% at 0% 0%, color-mix(in srgb, var(--brand) 10%, transparent), transparent 60%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_60%)]"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-5 px-6 pt-7 sm:px-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text">
              Insights · Weekly comparison
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.035em] sm:text-[40px] sm:leading-[1.05]">
              Who moved between weeks
            </h1>
            <p className="mt-2 text-[14px] text-muted">
              Pick two weeks to see every student’s belt change, language by language.
            </p>
          </div>
          <ShinyButton
            className="h-10 px-4 font-display text-[13.5px] font-semibold"
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            <Download size={15} /> Export CSV
          </ShinyButton>
        </div>

        {/* Week range */}
        <div className="relative mx-6 mt-6 flex flex-wrap items-stretch gap-2 sm:mx-8">
          <WeekPicker label="From" value={fromWeekId} weeks={weeks} onChange={setFromWeekId} />
          <button
            type="button"
            onClick={() => {
              setFromWeekId(toWeekId);
              setToWeekId(fromWeekId);
            }}
            title="Swap weeks"
            className="group grid w-11 place-items-center rounded-2xl border border-line bg-surface text-muted transition hover:border-ink/30 hover:text-ink"
          >
            <ArrowLeftRight size={16} className="transition group-hover:rotate-180" />
          </button>
          <WeekPicker label="To" value={toWeekId} weeks={weeks} onChange={setToWeekId} />
        </div>

        <div className="relative mt-5 flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/70 px-6 py-3 backdrop-blur sm:px-8">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search student name or email"
              aria-label="Search students"
              className="w-full rounded-xl border border-transparent bg-sunken py-2 pl-9 pr-8 text-[13.5px] outline-none transition placeholder:text-faint focus:border-line-strong focus:bg-surface"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-ink"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
          {currentProfile.role === "super_admin" ? (
            <PillSelect
              label="University"
              value={universityId}
              onChange={(id) => {
                setUniversityId(id);
                setFromWeekId("");
                setToWeekId("");
              }}
            >
              <option value="">All</option>
              {universities.map((university) => (
                <option key={university.id} value={university.id}>
                  {university.name}
                </option>
              ))}
            </PillSelect>
          ) : null}
          <PillSelect label="Squad" value={squadId} onChange={setSquadId}>
            <option value="">All</option>
            {squads.map((squad) => (
              <option key={squad.id} value={squad.id}>
                Squad {squad.number}
              </option>
            ))}
          </PillSelect>
          <PillSelect label="Status" value={status} onChange={(value) => setStatus(value as VisibleStatus)}>
            {statusChoices.map((value) => (
              <option key={value} value={value}>
                {value === "none" ? "All" : STATUS_META[value].label}
              </option>
            ))}
          </PillSelect>
          <AnimatePresence>
            {isLoading && comparisons ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="inline-flex items-center gap-2 text-[12px] font-medium text-muted"
              >
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Updating
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </section>

      {/* ── Body ─────────────────────────────────────────── */}
      <div className="mt-4">
        {error ? (
          <div className="flex flex-col items-center rounded-3xl border border-brand-line bg-brand-soft px-6 py-14 text-center">
            <AlertTriangle className="text-brand-text" size={22} />
            <p className="mt-3 font-display text-lg font-bold">Couldn’t load the comparison</p>
            <p className="mt-1 text-sm text-muted">{error}</p>
          </div>
        ) : !fromWeekId || !toWeekId ? (
          weeks.length || comparisons !== null ? (
            <Empty title="Pick two weeks" detail="Choose a from week and a to week to compare records." />
          ) : (
            <div className="grid min-h-[50vh] place-items-center rounded-3xl border border-line bg-surface">
              <DojoLoader lines={["Finding your weeks", "Lining up both weeks"]} />
            </div>
          )
        ) : firstLoad ? (
          <div className="grid min-h-[50vh] place-items-center rounded-3xl border border-line bg-surface">
            <DojoLoader lines={["Lining up both weeks", "Comparing belts", "Spotting the climbers"]} />
          </div>
        ) : (
          <div
            className={`space-y-4 transition-[opacity,filter] duration-300 ${isLoading ? "pointer-events-none opacity-55 saturate-50" : ""}`}
            aria-busy={isLoading}
          >
            {summary ? (
              <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                <section className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--card-shadow)]">
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-display text-[16px] font-semibold">
                      {summary.total} students ·{" "}
                      <span className="text-muted">
                        {fromWeek ? formatWeekLabel(fromWeek) : "—"} → {toWeek ? formatWeekLabel(toWeek) : "—"}
                      </span>
                    </h2>
                    <span className="text-[12px] text-muted">Click a segment to filter</span>
                  </div>
                  <ShareBar
                    active={status === "none" ? undefined : status}
                    onSelect={(key) =>
                      setStatus((current) => (current === key ? "none" : (key as VisibleStatus)))
                    }
                    segments={(["improved", "no_change", "missing_data"] as const).map((key) => ({
                      key,
                      label: STATUS_META[key].label,
                      value: summary[key],
                      color: STATUS_META[key].color,
                    }))}
                  />
                </section>
                <section className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--card-shadow)]">
                  <RingStat
                    value={summary.total ? summary.improved / summary.total : 0}
                    label="Moved up"
                    caption={
                      <>
                        <span className="font-semibold text-ink">{summary.improved}</span> students earned at
                        least one belt between these weeks.
                      </>
                    }
                  />
                </section>
              </div>
            ) : null}

            {rows.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--card-shadow)]">
                  <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold">
                    <Rocket size={16} className="text-brand-text" /> Top climbers
                  </h2>
                  {climbers.length ? (
                    <ol className="mt-3 space-y-1">
                      {climbers.map((row, index) => (
                        <motion.li
                          key={row.student_id}
                          initial={reduced ? false : { opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                        >
                          <button
                            type="button"
                            onClick={() => openHistory(row)}
                            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-2"
                          >
                            <span className="w-4 text-center font-display text-[13px] font-bold text-faint">
                              {index + 1}
                            </span>
                            <StudentAvatar id={row.student_id} name={row.student_name} email={row.email} size={32} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-semibold">
                                {row.student_name ?? "Unnamed student"}
                              </span>
                              <span className="block text-[11.5px] text-muted">
                                {row.squad_number ? `Squad ${row.squad_number}` : "No squad"} · {row.from_total ?? "—"} → {row.to_total ?? "—"}
                              </span>
                            </span>
                            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-bold tabular-nums text-success-text">
                              +{row.net_change}
                            </span>
                          </button>
                        </motion.li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-6 text-center text-sm text-muted">Nobody moved up in this view.</p>
                  )}
                </section>
                <section className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--card-shadow)]">
                  <h2 className="font-display text-[16px] font-semibold">Change in belts</h2>
                  <p className="text-[12px] text-muted">How many students gained or lost how many belts</p>
                  <Histogram data={distribution} />
                </section>
              </div>
            ) : null}

            {rows.length === 0 ? (
              <Empty title="No matching students" detail="Try a different squad, status or search." icon />
            ) : (
              <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--card-shadow)]">
                <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                  <h2 className="font-display text-[15px] font-semibold">Every student</h2>
                  <span className="text-[12px] text-muted">
                    {rows.length} {rows.length === 1 ? "record" : "records"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[980px]">
                    <div className="grid grid-cols-[minmax(0,2.2fr)_0.8fr_1.2fr_1fr_2.6fr] gap-4 bg-surface-2 px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
                      <span>Student</span>
                      <span>Squad</span>
                      <span>Belts</span>
                      <span>Status</span>
                      <span>By language</span>
                    </div>
                    <ul className="divide-y divide-line">
                      {rows.slice(0, limit).map((row, index) => (
                        <ComparisonRow
                          key={row.student_id}
                          row={row}
                          index={index}
                          status={status === "decreased" ? "decreased" : row.status}
                          onOpen={() => openHistory(row)}
                        />
                      ))}
                    </ul>
                  </div>
                </div>
                {rows.length > limit ? (
                  <div className="flex justify-center border-t border-line p-3">
                    <button
                      type="button"
                      onClick={() => setLimit((current) => current + PAGE)}
                      className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink"
                    >
                      Show {Math.min(PAGE, rows.length - limit)} more <ChevronDown size={14} />
                    </button>
                  </div>
                ) : null}
              </section>
            )}
          </div>
        )}
      </div>

      <HistoryDialog student={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );
}

function WeekPicker({
  label,
  value,
  weeks,
  onChange,
}: {
  label: string;
  value: string;
  weeks: Week[];
  onChange: (value: string) => void;
}) {
  const week = weeks.find((item) => item.id === value);
  return (
    <label className="group relative min-w-[200px] flex-1 cursor-pointer rounded-2xl border border-line bg-surface px-4 py-3 transition hover:border-line-strong focus-within:border-ink">
      <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint">{label}</span>
      <span className="mt-0.5 flex items-center gap-2 font-display text-[17px] font-semibold tracking-[-0.01em]">
        {week ? formatWeekLabel(week) : "Select week"}
        <ChevronDown size={15} className="text-muted" />
      </span>
      <select
        aria-label={`${label} week`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">Select week</option>
        {weeks.map((item) => (
          <option key={item.id} value={item.id}>
            {formatWeekLabel(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ComparisonRow({
  row,
  index,
  status,
  onOpen,
}: {
  row: Comparison;
  index: number;
  status: Exclude<VisibleStatus, "none">;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const meta = STATUS_META[status];
  const change = row.net_change;
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index, 15) * 0.015 }}
      className="grid grid-cols-[minmax(0,2.2fr)_0.8fr_1.2fr_1fr_2.6fr] items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2"
    >
      <button type="button" onClick={onOpen} className="group flex min-w-0 items-center gap-3 text-left">
        <StudentAvatar id={row.student_id} name={row.student_name} email={row.email} size={34} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-ink group-hover:text-brand-text">
            {row.student_name ?? "Unnamed student"}
          </span>
          <span className="block truncate text-[12px] text-muted">{row.email ?? "—"}</span>
        </span>
      </button>
      <span className="text-[13px] text-ink-2">{row.squad_number ? `#${row.squad_number}` : "—"}</span>
      <span className="flex items-center gap-2 text-[13px] tabular-nums">
        <span className="text-muted">{row.from_total ?? "—"}</span>
        <ArrowRight size={12} className="text-faint" />
        <span className="font-semibold text-ink">{row.to_total ?? "—"}</span>
        {change !== null && change !== 0 ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11.5px] font-bold ${change > 0 ? "bg-success-soft text-success-text" : "bg-brand-soft text-brand-text"}`}
          >
            {change > 0 ? `+${change}` : change}
          </span>
        ) : null}
      </span>
      <span>
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${meta.badge}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" /> {meta.label}
        </span>
      </span>
      <span className="flex flex-wrap gap-1.5">
        {LANGUAGES.map((language) => {
          const pair = row.languages[language];
          const up = pair.from !== null && pair.to !== null && pair.to > pair.from;
          return (
            <span
              key={language}
              title={LANGUAGE_LABELS[language]}
              className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[11.5px] tabular-nums ${up ? "border-success-line bg-success-soft" : "border-line bg-surface-2"}`}
            >
              <LanguageLogo language={language} size={16} />
              <span className="text-muted">{pair.from ?? "—"}</span>
              <span className="text-faint">→</span>
              <span className={`font-semibold ${up ? "text-success-text" : "text-ink"}`}>{pair.to ?? "—"}</span>
            </span>
          );
        })}
      </span>
    </motion.li>
  );
}

/** Bar per belt change (−n … +n), coloured by direction. */
function Histogram({ data }: { data: Array<{ change: number; count: number }> }) {
  if (!data.length)
    return <p className="py-10 text-center text-sm text-muted">No comparable records.</p>;
  const max = Math.max(1, ...data.map((item) => item.count));
  return (
    <div className="mt-4 flex h-44 items-end gap-1.5">
      {data.map((item, index) => {
        const color =
          item.change > 0 ? "var(--status-up)" : item.change < 0 ? "var(--status-down)" : "var(--status-same)";
        return (
          <div key={item.change} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[11px] font-semibold tabular-nums text-ink-2">
              {item.count || ""}
            </span>
            <motion.div
              className="w-full max-w-10 rounded-t-md"
              style={{ background: color }}
              initial={{ height: 0 }}
              animate={{ height: `${item.count ? Math.max(4, (item.count / max) * 78) : 0}%` }}
              transition={{ delay: index * 0.04, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              title={`${item.count} students changed by ${item.change > 0 ? "+" : ""}${item.change}`}
            />
            <span className="mt-1.5 text-[11px] tabular-nums text-muted">
              {item.change > 0 ? `+${item.change}` : item.change}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ title, detail, icon = false }: { title: string; detail: string; icon?: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
      {icon ? (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-sunken text-muted">
          <SearchX size={22} />
        </span>
      ) : null}
      <p className="font-display text-lg font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{detail}</p>
    </div>
  );
}

function mergeUniversities(current: University[], rows: Comparison[]) {
  const next = new Map(current.map((item) => [item.id, item]));
  rows.forEach((row) => {
    if (row.university_id && row.university_name)
      next.set(row.university_id, { id: row.university_id, name: row.university_name });
  });
  return Array.from(next.values()).sort((a, b) => a.name.localeCompare(b.name));
}
function mergeSquads(current: Squad[], rows: Comparison[]) {
  const next = new Map(current.map((item) => [item.id, item]));
  rows.forEach((row) => {
    if (row.squad_id && row.squad_number)
      next.set(row.squad_id, { id: row.squad_id, number: row.squad_number });
  });
  return Array.from(next.values()).sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true }),
  );
}
function formatPair(pair: LanguagePair) {
  return `${pair.from ?? "—"} → ${pair.to ?? "—"}`;
}
function csvValue(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}
function sortDisplayedRows(rows: Comparison[], status: VisibleStatus) {
  if (status === "no_change" || status === "missing_data") return rows;
  return [...rows].sort((left, right) => {
    if (left.net_change === null && right.net_change !== null) return 1;
    if (left.net_change !== null && right.net_change === null) return -1;
    if (left.net_change !== null && right.net_change !== null && right.net_change !== left.net_change)
      return right.net_change - left.net_change;
    return (left.student_name ?? "").localeCompare(right.student_name ?? "");
  });
}
