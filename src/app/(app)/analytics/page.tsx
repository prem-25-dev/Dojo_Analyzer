"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Award,
  CalendarDays,
  CalendarRange,
  Gauge,
  Layers,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  getCurrentUserProfile,
  type CurrentUserProfile,
} from "@/lib/auth/profile";
import { PageState as CenterState } from "@/components/ui/skeleton";
import { DojoLoader } from "@/components/ui/dojo-loader";
import {
  Delta,
  Em,
  Headline,
  LanguageCards,
  MonthStrip,
  PillSelect,
  RingStat,
  Segmented,
  StatTile,
  TrendPanel,
  type LanguageMetric,
  type TrendPoint,
} from "@/components/insights/kit";
import { LANGUAGE_COLORS } from "@/components/dashboard/chart-kit";
import { LANGUAGES, LANGUAGE_LABELS } from "@/lib/dashboard/metrics";
import { useCachedProfile } from "@/lib/auth/use-cached-profile";

// ─── Types ────────────────────────────────────────────────────────────────────
type AnalyticsTab = "monthly" | "yearly";
type Language = "all" | "java" | "nodejs" | "python" | "cpp";
type LanguageKey = Exclude<Language, "all">;
type Summary = {
  total_students: number;
  total_belts: number;
  belts_earned: number;
  improved_students: number;
  average_belts_per_student: number | null;
  no_change_students: number;
};
type Filters = {
  year: number;
  years: number[];
  universities: Array<{ id: string; name: string | null }>;
  squads: Array<{ id: string; squad_number: string }>;
};
type MonthlyResponse = {
  filters?: Filters & { month: number; months: number[]; language: Language };
  summary?: Summary;
  languageBreakdown?: Record<LanguageKey, LanguageMetric>;
  monthlyTrend?: TrendPoint[];
  error?: string;
};
type YearlyResponse = {
  filters?: Filters;
  summary?: Summary;
  languageBreakdown?: Record<LanguageKey, LanguageMetric>;
  monthlyTrend?: TrendPoint[];
  error?: string;
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const router = useRouter();
  const cachedProfile = useCachedProfile();
  const [profileState, setProfileState] = useState<
    CurrentUserProfile | { status: "loading" }
  >(cachedProfile ?? { status: "loading" });
  const [tab, setTab] = useState<AnalyticsTab>("monthly");
  const [selectedUniversityId, setSelectedUniversityId] = useState("");

  const [mYear, setMYear] = useState<number | null>(null);
  const [mMonth, setMMonth] = useState<number | null>(null);
  const [mSquad, setMSquad] = useState("");
  const [mLang, setMLang] = useState<Language>("all");
  const [mData, setMData] = useState<MonthlyResponse | null>(null);
  const [mLoading, setMLoading] = useState(false);
  const [mError, setMError] = useState("");

  const [yYear, setYYear] = useState<number | null>(null);
  const [ySquad, setYSquad] = useState("");
  const [yData, setYData] = useState<YearlyResponse | null>(null);
  const [yLoading, setYLoading] = useState(false);
  const [yError, setYError] = useState("");

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
  }, [profileState, router]);

  // Monthly fetch
  useEffect(() => {
    if (profileState.status !== "authenticated" || tab !== "monthly") return;
    const controller = new AbortController();
    const query = new URLSearchParams({ language: mLang });
    if (selectedUniversityId) query.set("university_id", selectedUniversityId);
    if (mYear !== null) query.set("year", String(mYear));
    if (mMonth !== null) query.set("month", String(mMonth));
    if (mSquad) query.set("squad_id", mSquad);

    async function load() {
      setMLoading(true);
      setMError("");
      try {
        const response = await fetch(`/api/analytics/monthly?${query}`, {
          signal: controller.signal,
        });
        const result = (await response.json()) as MonthlyResponse;
        if (!response.ok)
          throw new Error(result.error ?? "Unable to load monthly analytics.");
        setMData(result);
        if (result.filters) {
          setMYear((current) => current ?? result.filters!.year);
          setMMonth((current) => current ?? result.filters!.month);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMError(
          error instanceof Error ? error.message : "Unable to load monthly analytics.",
        );
      } finally {
        if (!controller.signal.aborted) setMLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [profileState, tab, mYear, mMonth, mSquad, mLang, selectedUniversityId]);

  // Yearly fetch
  useEffect(() => {
    if (profileState.status !== "authenticated" || tab !== "yearly") return;
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (selectedUniversityId) query.set("university_id", selectedUniversityId);
    if (yYear !== null) query.set("year", String(yYear));
    if (ySquad) query.set("squad_id", ySquad);

    async function load() {
      setYLoading(true);
      setYError("");
      try {
        const response = await fetch(`/api/analytics/yearly?${query}`, {
          signal: controller.signal,
        });
        const result = (await response.json()) as YearlyResponse;
        if (!response.ok)
          throw new Error(result.error ?? "Unable to load yearly analytics.");
        setYData(result);
        if (result.filters) setYYear((current) => current ?? result.filters!.year);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setYError(
          error instanceof Error ? error.message : "Unable to load yearly analytics.",
        );
      } finally {
        if (!controller.signal.aborted) setYLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [profileState, tab, yYear, ySquad, selectedUniversityId]);

  if (profileState.status === "loading")
    return <CenterState message="Checking your account" loading />;
  if (profileState.status === "unauthenticated")
    return <CenterState message="Redirecting to login" loading />;
  if (profileState.status === "unassigned")
    return (
      <CenterState
        message="Account not assigned"
        detail="Your account does not have an assigned profile yet."
      />
    );
  if (profileState.status === "invalid_role")
    return <CenterState message="Account role not supported" />;
  if (profileState.status === "error")
    return (
      <CenterState message="Unable to load your account" detail={profileState.message} />
    );
  const currentProfile =
    profileState.status === "authenticated" ? profileState.profile : null;
  if (!currentProfile)
    return <CenterState message="Unable to determine your account role" />;

  const isSuperAdmin = currentProfile.role === "super_admin";
  const data = tab === "monthly" ? mData : yData;
  const filters = data?.filters;
  const universityValue = isSuperAdmin
    ? selectedUniversityId
    : (filters?.universities[0]?.id ?? currentProfile.university_id ?? "");

  function changeUniversity(id: string) {
    setSelectedUniversityId(id);
    setMSquad("");
    setYSquad("");
    setMYear(null);
    setMMonth(null);
    setYYear(null);
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-16 lg:px-8">
      {/* ── Hero + filters ───────────────────────────────── */}
      <section className="relative mt-2 overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--card-shadow)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 140% at 100% 0%, color-mix(in srgb, var(--brand) 12%, transparent), transparent 60%), radial-gradient(40% 120% at 0% 100%, color-mix(in srgb, var(--lang-nodejs) 10%, transparent), transparent 60%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_60%)]"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-5 px-6 pt-7 sm:px-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text">
              Insights
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.035em] sm:text-[40px] sm:leading-[1.05]">
              Belt progress, month by month
            </h1>
            <p className="mt-2 text-[14px] text-muted">
              How many belts your students earned, who improved, and which
              language is moving fastest.
            </p>
          </div>
          <Segmented
            id="analytics-tab"
            value={tab}
            onChange={setTab}
            options={[
              { value: "monthly", label: "Monthly", icon: <CalendarDays size={14} /> },
              { value: "yearly", label: "Yearly", icon: <CalendarRange size={14} /> },
            ]}
          />
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/70 px-6 py-3 backdrop-blur sm:px-8">
          <PillSelect
            label="Year"
            value={(tab === "monthly" ? mYear : yYear)?.toString() ?? ""}
            onChange={(value) => {
              if (tab === "monthly") {
                setMYear(Number(value));
                setMMonth(null);
              } else setYYear(Number(value));
            }}
          >
            {!filters?.years.length ? <option value="">—</option> : null}
            {filters?.years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </PillSelect>
          {tab === "monthly" ? (
            <PillSelect
              label="Month"
              value={mMonth?.toString() ?? ""}
              onChange={(value) => setMMonth(Number(value))}
            >
              {!mData?.filters?.months.length ? <option value="">—</option> : null}
              {mData?.filters?.months.map((month) => (
                <option key={month} value={month}>
                  {monthName(month)}
                </option>
              ))}
            </PillSelect>
          ) : null}
          <PillSelect
            label="University"
            value={universityValue}
            onChange={changeUniversity}
            disabled={!isSuperAdmin}
          >
            {isSuperAdmin ? <option value="">All</option> : null}
            {filters?.universities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </PillSelect>
          <PillSelect
            label="Squad"
            value={tab === "monthly" ? mSquad : ySquad}
            onChange={tab === "monthly" ? setMSquad : setYSquad}
          >
            <option value="">All</option>
            {filters?.squads.map((squad) => (
              <option key={squad.id} value={squad.id}>
                Squad {squad.squad_number}
              </option>
            ))}
          </PillSelect>
          {tab === "monthly" ? (
            <PillSelect
              label="Language"
              value={mLang}
              onChange={(value) => setMLang(value as Language)}
            >
              <option value="all">All</option>
              {LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {LANGUAGE_LABELS[language]}
                </option>
              ))}
            </PillSelect>
          ) : null}
          <AnimatePresence>
            {(tab === "monthly" ? mLoading : yLoading) && data ? (
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="ml-auto inline-flex items-center gap-2 text-[12px] font-medium text-muted"
              >
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Updating
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </section>

      <div className="mt-4">
        {tab === "monthly" ? (
          <Body
            loading={mLoading}
            error={mError}
            hasData={Boolean(mData?.summary?.total_students)}
            firstLoad={!mData}
          >
            {mData?.summary ? (
              <MonthlyView
                data={mData}
                month={mMonth}
                language={mLang}
                onMonth={setMMonth}
                onLanguage={(language) =>
                  setMLang((current) => (current === language ? "all" : language))
                }
              />
            ) : null}
          </Body>
        ) : (
          <Body
            loading={yLoading}
            error={yError}
            hasData={Boolean(yData?.summary?.total_students)}
            firstLoad={!yData}
          >
            {yData?.summary ? (
              <YearlyView
                data={yData}
                year={yYear}
                onMonth={(month) => {
                  setMYear(yYear);
                  setMMonth(month);
                  setTab("monthly");
                }}
              />
            ) : null}
          </Body>
        )}
      </div>
    </div>
  );
}

/** Handles first load, errors and empty data; dims stale content while refetching. */
function Body({
  loading,
  error,
  hasData,
  firstLoad,
  children,
}: {
  loading: boolean;
  error: string;
  hasData: boolean;
  firstLoad: boolean;
  children: ReactNode;
}) {
  if (firstLoad && !error)
    return (
      <div className="grid min-h-[50vh] place-items-center rounded-3xl border border-line bg-surface">
        <DojoLoader lines={["Crunching the months", "Counting promotions", "Comparing languages"]} />
      </div>
    );
  if (error)
    return (
      <div className="flex flex-col items-center rounded-3xl border border-brand-line bg-brand-soft px-6 py-14 text-center">
        <AlertTriangle className="text-brand-text" size={22} />
        <p className="mt-3 font-display text-lg font-bold text-ink">Couldn’t load insights</p>
        <p className="mt-1 text-sm text-muted">{error}</p>
      </div>
    );
  if (!hasData && !loading)
    return (
      <div className="flex flex-col items-center rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sunken text-muted">
          <CalendarDays size={22} />
        </span>
        <p className="mt-4 font-display text-lg font-bold">Nothing recorded for this period</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Pick another month or squad, or import this period’s weekly CSV.
        </p>
      </div>
    );
  return (
    <div
      className={`space-y-4 transition-[opacity,filter] duration-300 ${loading ? "pointer-events-none opacity-55 saturate-50" : ""}`}
      aria-busy={loading}
    >
      {children}
    </div>
  );
}

function leadingLanguage(breakdown: Record<LanguageKey, LanguageMetric> | undefined) {
  const ranked = [...LANGUAGES].sort(
    (a, b) => (breakdown?.[b]?.belts_earned ?? 0) - (breakdown?.[a]?.belts_earned ?? 0),
  );
  const top = ranked[0];
  return top && (breakdown?.[top]?.belts_earned ?? 0) > 0 ? top : null;
}

function previousPoint(trend: TrendPoint[], month: number | null) {
  const index = trend.findIndex((point) => point.month === month);
  return index > 0 ? trend[index - 1] : null;
}

// ─── Monthly ──────────────────────────────────────────────────────────────────
function MonthlyView({
  data,
  month,
  language,
  onMonth,
  onLanguage,
}: {
  data: MonthlyResponse;
  month: number | null;
  language: Language;
  onMonth: (month: number) => void;
  onLanguage: (language: LanguageKey) => void;
}) {
  const summary = data.summary!;
  const trend = data.monthlyTrend ?? [];
  const current = trend.find((point) => point.month === month) ?? null;
  const previous = previousPoint(trend, month);
  const leader = leadingLanguage(data.languageBreakdown);
  const rate = summary.total_students ? summary.improved_students / summary.total_students : 0;
  const diff = (key: "belts_earned" | "total_belts" | "average_belts_per_student" | "total_students") => {
    if (!previous || !current) return null;
    return (current[key] ?? 0) - (previous[key] ?? 0);
  };
  const vs = previous ? `vs ${monthName(previous.month).slice(0, 3)}` : undefined;
  const name = monthName(month ?? data.filters?.month ?? 1);
  const earnedDiff = diff("belts_earned");

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--card-shadow)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            {name} {data.filters?.year} at a glance
          </p>
          <div className="mt-3">
            <Headline>
              {summary.belts_earned > 0 ? (
                <>
                  <Em color="var(--status-up)">{summary.improved_students}</Em> of{" "}
                  {summary.total_students} students earned{" "}
                  <Em>{summary.belts_earned} belts</Em> in {name}
                  {leader ? (
                    <>
                      , led by{" "}
                      <Em color={LANGUAGE_COLORS[leader]}>{LANGUAGE_LABELS[leader]}</Em>{" "}
                      (+{data.languageBreakdown?.[leader]?.belts_earned})
                    </>
                  ) : null}
                  .
                </>
              ) : (
                <>
                  No promotions yet in {name} — {summary.total_students} students
                  have records.
                </>
              )}
            </Headline>
          </div>
          {previous && earnedDiff !== null ? (
            <p className="mt-3 text-[13px] text-muted">
              That’s{" "}
              {earnedDiff === 0
                ? "the same as"
                : `${Math.abs(earnedDiff)} ${earnedDiff > 0 ? "more" : "fewer"} belts than`}{" "}
              {monthName(previous.month)}.
            </p>
          ) : null}
        </section>
        <section className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--card-shadow)]">
          <RingStat
            value={rate}
            label="Improvement rate"
            caption={
              <>
                <span className="font-semibold text-ink">{summary.improved_students}</span> moved up,{" "}
                <span className="font-semibold text-ink">{summary.no_change_students}</span> held
                steady this month.
              </>
            }
          />
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          index={0}
          label="Belts earned"
          value={summary.belts_earned}
          icon={<Award size={17} />}
          tint="var(--series-2)"
          footer={<Delta value={diff("belts_earned")} label={vs} />}
        />
        <StatTile
          index={1}
          label="Students with data"
          value={summary.total_students}
          icon={<Users size={17} />}
          tint="var(--series-1)"
          footer={<Delta value={diff("total_students")} label={vs} />}
        />
        <StatTile
          index={2}
          label="Total belts (month end)"
          value={summary.total_belts}
          icon={<Layers size={17} />}
          tint="var(--series-3)"
          footer={<Delta value={diff("total_belts")} label={vs} />}
        />
        <StatTile
          index={3}
          label="Avg belts / student"
          value={summary.average_belts_per_student}
          decimals={2}
          icon={<Gauge size={17} />}
          tint="var(--series-7)"
          footer={<Delta value={diff("average_belts_per_student")} label={vs} />}
        />
      </div>

      {trend.length > 1 ? (
        <section className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--card-shadow)]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-[16px] font-semibold">Pick a month</h2>
            <span className="text-[12px] text-muted">Darker = more belts earned</span>
          </div>
          <MonthStrip data={trend} selected={month} onSelect={onMonth} />
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="font-display text-[16px] font-semibold">By language</h2>
          <span className="text-[12px] text-muted">Click a language to focus on it</span>
        </div>
        <LanguageCards
          breakdown={data.languageBreakdown}
          selected={language === "all" ? undefined : language}
          onSelect={onLanguage}
        />
      </section>

      <TrendPanel
        data={trend}
        title="Across the year"
        subtitle={`Monthly totals for ${data.filters?.year ?? ""}`}
        highlightMonth={month}
      />
    </>
  );
}

// ─── Yearly ───────────────────────────────────────────────────────────────────
function YearlyView({
  data,
  year,
  onMonth,
}: {
  data: YearlyResponse;
  year: number | null;
  onMonth: (month: number) => void;
}) {
  const summary = data.summary!;
  const trend = data.monthlyTrend ?? [];
  const best = [...trend].sort((a, b) => b.belts_earned - a.belts_earned)[0];
  const leader = leadingLanguage(data.languageBreakdown);
  const rate = summary.total_students ? summary.improved_students / summary.total_students : 0;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--card-shadow)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            {year} in review
          </p>
          <div className="mt-3">
            <Headline>
              <Em>{summary.belts_earned} belts</Em> earned across{" "}
              {summary.total_students} students
              {best && best.belts_earned > 0 ? (
                <>
                  ; <Em color="var(--series-1)">{monthName(best.month)}</Em> was the
                  strongest month (+{best.belts_earned})
                </>
              ) : null}
              {leader ? (
                <>
                  {" "}
                  and <Em color={LANGUAGE_COLORS[leader]}>{LANGUAGE_LABELS[leader]}</Em>{" "}
                  led the languages
                </>
              ) : null}
              .
            </Headline>
          </div>
        </section>
        <section className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--card-shadow)]">
          <RingStat
            value={rate}
            label="Improved this year"
            caption={
              <>
                <span className="font-semibold text-ink">{summary.improved_students}</span> students
                gained at least one belt;{" "}
                <span className="font-semibold text-ink">{summary.no_change_students}</span> didn’t.
              </>
            }
          />
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile index={0} label="Belts earned" value={summary.belts_earned} icon={<Award size={17} />} tint="var(--series-2)" />
        <StatTile index={1} label="Students" value={summary.total_students} icon={<Users size={17} />} tint="var(--series-1)" />
        <StatTile index={2} label="Total belts" value={summary.total_belts} icon={<Layers size={17} />} tint="var(--series-3)" />
        <StatTile
          index={3}
          label="Avg belts / student"
          value={summary.average_belts_per_student}
          decimals={2}
          icon={<TrendingUp size={17} />}
          tint="var(--series-7)"
        />
      </div>

      {trend.length ? (
        <section className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--card-shadow)]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-[16px] font-semibold">Month by month</h2>
            <span className="text-[12px] text-muted">Click a month to open it</span>
          </div>
          <MonthStrip data={trend} selected={null} onSelect={onMonth} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 px-1 font-display text-[16px] font-semibold">By language</h2>
        <LanguageCards breakdown={data.languageBreakdown} />
      </section>

      <TrendPanel
        data={trend}
        title="Monthly progress"
        subtitle={`Each month of ${year ?? ""}`}
      />
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function monthName(month: number) {
  return new Intl.DateTimeFormat("en", { month: "long" }).format(
    new Date(2020, month - 1, 1),
  );
}
