"use client";

import { ArrowDown, ArrowUp, LayoutGrid, List, Minus } from "lucide-react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConfettiBurst } from "@/components/leaderboard/confetti-burst";
import { Podium } from "@/components/leaderboard/podium";
import type { RankedStudent } from "@/components/leaderboard/types";
import { CountUp } from "@/components/reactbits/count-up";
import { LightRays } from "@/components/reactbits/light-rays";
import { SpotlightCard } from "@/components/reactbits/spotlight-card";
import { DojoLoader } from "@/components/ui/dojo-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentAvatar } from "@/components/students/avatar";
import { HistoryDialog } from "@/components/students/history-dialog";
import type { Student } from "@/components/students/types";
import {
  BeltBadge,
  BeltStrip,
  BeltTag,
  LanguageLogo,
} from "@/components/belts/belts";
import { LANGUAGES, LANGUAGE_LABELS, type Language } from "@/lib/dashboard/metrics";

const PAGE = 40;

/**
 * Leaderboard page body: light-ray hero with a stepped podium for the top
 * three, headline stats, and an animated ranking list for everyone else.
 */
export function LeaderboardExperience({
  eyebrow,
  title,
  subtitle,
  controls,
  entries,
  scoreLabel,
  isLoading,
  error,
  currentStudentId,
  linkStudents,
  emptyMessage,
  language,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  controls?: ReactNode;
  entries: RankedStudent[];
  scoreLabel: string;
  isLoading: boolean;
  error: string;
  currentStudentId: string | null;
  linkStudents: boolean;
  emptyMessage: string;
  /** Set on single-language leaderboards; the score is that language's level. */
  language?: Language;
}) {
  const [openEntry, setOpenEntry] = useState<RankedStudent | null>(null);
  const [view, setView] = useState<RankingView>(readView);
  const top = entries.slice(0, 3);
  const rest = entries.slice(3);
  const you = entries.find((entry) => entry.studentId === currentStudentId);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 pb-24 pt-2 lg:px-8">
      {/* Hero stage */}
      <section className="relative isolate overflow-hidden rounded-3xl bg-[#0b0b0e] text-white [clip-path:inset(0_round_1.5rem)]">
        <div aria-hidden="true" className="absolute inset-0">
          <LightRays
            raysOrigin="top-center"
            raysColor="#ffd9a8"
            raysSpeed={0.9}
            lightSpread={0.9}
            rayLength={1.6}
            fadeDistance={1.1}
            followMouse
            mouseInfluence={0.08}
            noiseAmount={0.06}
            distortion={0.04}
          />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0b0b0e] to-transparent"
        />
        {!isLoading && top[0] && top[0].score > 0 && (
          <ConfettiBurst key={top[0].studentId} />
        )}

        <div className="relative px-6 pt-8 text-center sm:px-10 sm:pt-10">
          <p className="text-[13px] font-medium text-white/55">{eyebrow}</p>
          <h1 className="mt-1 font-display text-[32px] font-extrabold leading-tight tracking-[-0.04em] sm:text-[44px]">
            {title}
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-[14px] text-white/60">
            {subtitle}
          </p>
        </div>

        <div className="relative px-3 pb-0 pt-8 sm:px-10">
          {isLoading ? (
            <PodiumLoader />
          ) : error || entries.length === 0 ? (
            <div className="flex h-56 items-center justify-center pb-10 text-center text-sm text-white/60">
              {error || emptyMessage}
            </div>
          ) : (
            <Podium
              top={top}
              scoreLabel={scoreLabel}
              currentStudentId={currentStudentId}
              onOpen={setOpenEntry}
            />
          )}
        </div>
      </section>

      {controls}

      {isLoading && <RankingGhost />}

      {!isLoading && !error && entries.length > 0 && (
        <>
          <StatStrip entries={entries} scoreLabel={scoreLabel} />
          <RankingList
            entries={rest}
            total={entries.length}
            scoreLabel={scoreLabel}
            currentStudentId={currentStudentId}
            onOpen={setOpenEntry}
            view={view}
            onView={(next) => {
              setView(next);
              try {
                localStorage.setItem(VIEW_KEY, next);
              } catch {
                // Storage can be blocked; the choice still applies now.
              }
            }}
            language={language}
          />
        </>
      )}

      <HistoryDialog
        student={openEntry ? toStudent(openEntry) : null}
        onClose={() => setOpenEntry(null)}
        canViewHistory={linkStudents}
        snapshot={
          openEntry
            ? {
                rank: openEntry.rank,
                score: openEntry.score,
                scoreLabel,
                change: openEntry.change,
                levels:
                  openEntry.languages ??
                  (language ? { [language]: openEntry.score } : undefined),
              }
            : undefined
        }
      />

      {you && you.rank > 3 && <YouPill you={you} scoreLabel={scoreLabel} />}
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────
/** Ghost podium whose steps breathe while rankings load. */
function PodiumLoader() {
  const steps = [
    { height: 128, delay: "0.15s" },
    { height: 176, delay: "0s" },
    { height: 96, delay: "0.3s" },
  ];
  return (
    <div className="flex flex-col items-center">
      <div className="pb-8">
        <DojoLoader
          tone="dark"
          lines={["Tallying belts", "Ranking the dojo", "Polishing the medals"]}
        />
      </div>
      <div className="flex w-full items-end justify-center gap-2 sm:gap-4">
        {steps.map((step, index) => (
          <div
            key={index}
            className="flex w-[31%] max-w-[220px] flex-col items-center"
          >
            <span className="mb-3 h-14 w-14 animate-pulse rounded-full bg-white/[0.07] sm:h-16 sm:w-16" />
            <span className="mb-4 h-2.5 w-20 animate-pulse rounded-full bg-white/[0.07]" />
            <div
              className="dojo-anim w-full origin-bottom rounded-t-2xl bg-gradient-to-b from-white/[0.09] to-white/[0.02]"
              style={{
                height: step.height,
                animation: `podium-ghost 1.8s ${step.delay} ease-in-out infinite`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder rows under the podium while rankings load. */
function RankingGhost() {
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--card-shadow)]">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-0"
          style={{ opacity: 1 - i * 0.13 }}
        >
          <Skeleton className="h-4 w-6" />
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3" style={{ width: `${28 + (i % 3) * 9}%` }} />
            <Skeleton className="h-2.5 w-1/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Headline stats ───────────────────────────────────────────────────────────
function StatStrip({
  entries,
  scoreLabel,
}: {
  entries: RankedStudent[];
  scoreLabel: string;
}) {
  const scores = entries.map((entry) => entry.score);
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const stats = [
    { label: "Ranked students", value: entries.length },
    { label: `Top ${scoreLabel}`, value: Math.max(...scores) },
    { label: `Average ${scoreLabel}`, value: average, decimals: 2 },
    {
      label: "Climbed this week",
      value: entries.filter((entry) => entry.change > 0).length,
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <SpotlightCard key={stat.label} className="px-5 py-4">
          <p className="text-[12.5px] font-medium text-muted">{stat.label}</p>
          <p className="mt-1 font-display text-[28px] font-bold leading-none tracking-[-0.03em] text-ink">
            <CountUp
              key={`${stat.label}-${stat.value}`}
              to={stat.value}
              decimals={stat.decimals ?? 0}
            />
          </p>
        </SpotlightCard>
      ))}
    </div>
  );
}

// ─── Ranks 4+ ─────────────────────────────────────────────────────────────────
type RankingView = "list" | "cards";
const VIEW_KEY = "dojo-leaderboard-view";

function readView(): RankingView {
  try {
    return localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "list";
  } catch {
    return "list";
  }
}

function toStudent(entry: RankedStudent): Student {
  return {
    id: entry.studentId,
    name: entry.name,
    email: null,
    squad_id: null,
    squad_number: entry.squad,
    university_name: entry.university,
    start_date: null,
    end_date: null,
  };
}

type RowProps = {
  scoreLabel: string;
  onOpen: (entry: RankedStudent) => void;
  language?: Language;
};

function RankingList({
  entries,
  total,
  scoreLabel,
  currentStudentId,
  onOpen,
  view,
  onView,
  language,
}: RowProps & {
  entries: RankedStudent[];
  total: number;
  currentStudentId: string | null;
  view: RankingView;
  onView: (view: RankingView) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, PAGE);

  if (entries.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 lg:px-6">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em]">
            Rankings
          </h2>
          <span className="text-[12.5px] text-muted">#4 – #{total}</span>
        </div>
        <div role="radiogroup" aria-label="Layout" className="flex rounded-xl bg-sunken p-1">
          {(
            [
              ["list", List, "List"],
              ["cards", LayoutGrid, "Belt cards"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={view === id}
              onClick={() => onView(id)}
              className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${view === id ? "text-ink" : "text-muted hover:text-ink-2"}`}
            >
              {view === id ? (
                <motion.span
                  layoutId="leaderboard-view"
                  className="absolute inset-0 rounded-lg bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
              <Icon size={14} className="relative" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </div>
      {view === "list" ? (
        <LayoutGroup>
          <ol>
            <AnimatePresence initial={false}>
              {visible.map((entry, index) => (
                <RankingRow
                  key={entry.studentId}
                  entry={entry}
                  index={index}
                  scoreLabel={scoreLabel}
                  isYou={entry.studentId === currentStudentId}
                  onOpen={onOpen}
                  language={language}
                />
              ))}
            </AnimatePresence>
          </ol>
        </LayoutGroup>
      ) : (
        <ol className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
          {visible.map((entry, index) => (
            <BeltCard
              key={entry.studentId}
              entry={entry}
              index={index}
              scoreLabel={scoreLabel}
              isYou={entry.studentId === currentStudentId}
              onOpen={onOpen}
              language={language}
            />
          ))}
        </ol>
      )}
      {entries.length > PAGE && (
        <div className="border-t border-line px-5 py-3.5 text-center lg:px-6">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="font-display text-[13px] font-semibold text-ink-2 hover:text-ink"
          >
            {expanded ? "Show less" : `Show all ${entries.length}`}
          </button>
        </div>
      )}
    </section>
  );
}

/** Per-language belts for a row: logo + ladder, or the single ranked language. */
function RowBelts({ entry, language }: { entry: RankedStudent; language?: Language }) {
  if (entry.languages)
    return (
      <span className="hidden items-center gap-1.5 md:flex">
        {LANGUAGES.map((key) => (
          <BeltBadge key={key} language={key} level={entry.languages?.[key] ?? 0} />
        ))}
      </span>
    );
  if (language)
    return (
      <span className="hidden items-center gap-2 md:flex">
        <BeltBadge language={language} level={entry.score} />
        <BeltTag level={entry.score} compact />
      </span>
    );
  return null;
}

function RankingRow({
  entry,
  index,
  scoreLabel,
  isYou,
  onOpen,
  language,
}: RowProps & {
  entry: RankedStudent;
  index: number;
  isYou: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.li
      id={isYou ? "leaderboard-you" : undefined}
      layout={reduced ? false : "position"}
      initial={reduced ? false : { opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? undefined : { opacity: 0, x: 12 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 28,
        delay: reduced ? 0 : Math.min(index, 12) * 0.025,
      }}
      className="scroll-mt-28"
    >
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className={`flex w-full items-center gap-3 border-b border-line px-3 py-3 text-left transition-colors last:border-b-0 sm:px-5 lg:px-6 ${
          isYou ? "bg-brand-soft" : "hover:bg-surface-2"
        }`}
      >
        <span className="w-10 shrink-0 text-center font-display text-[15px] font-bold tabular-nums text-faint">
          {entry.rank}
        </span>
        <StudentAvatar id={entry.studentId} name={entry.name} size={36} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-display text-[14.5px] font-semibold text-ink">
              {entry.name}
            </span>
            {isYou && (
              <span className="rounded-md bg-action px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">
                You
              </span>
            )}
          </span>
          <span className="block truncate text-[12.5px] text-muted">
            {[entry.squad && `Squad ${entry.squad}`, entry.university]
              .filter(Boolean)
              .join(" · ") || "—"}
          </span>
        </span>
        <RowBelts entry={entry} language={language} />
        <span className="w-20 text-right">
          <span className="font-display text-[17px] font-bold tabular-nums text-ink">
            {entry.score}
          </span>
          <span className="ml-1 text-[11.5px] text-muted">{scoreLabel}</span>
        </span>
        <span className="w-14 text-right">
          <ChangeBadge change={entry.change} />
        </span>
      </button>
    </motion.li>
  );
}

/** Coding-workouts style card: every language's belt ladder at a glance. */
function BeltCard({
  entry,
  index,
  scoreLabel,
  isYou,
  onOpen,
  language,
}: RowProps & {
  entry: RankedStudent;
  index: number;
  isYou: boolean;
}) {
  const reduced = useReducedMotion();
  const levels: Partial<Record<Language, number>> =
    entry.languages ?? (language ? { [language]: entry.score } : {});
  const shown = LANGUAGES.filter((key) => key in levels);
  return (
    <motion.li
      id={isYou ? "leaderboard-you" : undefined}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduced ? 0 : Math.min(index, 12) * 0.03 }}
      className="scroll-mt-28"
    >
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className={`group block h-full w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--pop-shadow)] ${isYou ? "border-brand-line bg-brand-soft" : "border-line bg-surface hover:border-line-strong"}`}
      >
        <div className="flex items-center gap-3">
          <span className="font-display text-[20px] font-bold tabular-nums text-faint">
            #{entry.rank}
          </span>
          <StudentAvatar id={entry.studentId} name={entry.name} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[14.5px] font-semibold text-ink">
              {entry.name}
            </span>
            <span className="block truncate text-[12px] text-muted">
              {[entry.squad && `Squad ${entry.squad}`, entry.university].filter(Boolean).join(" · ") || "—"}
            </span>
          </span>
          <span className="text-right">
            <span className="block font-display text-[20px] font-bold leading-none tabular-nums">
              {entry.score}
            </span>
            <span className="text-[11px] text-muted">{scoreLabel}</span>
          </span>
        </div>
        <ul className="mt-4 space-y-2.5 border-t border-dashed border-line pt-3.5">
          {shown.map((key, row) => (
            <li key={key} className="flex items-center gap-2.5">
              <LanguageLogo language={key} size={20} />
              <span className="w-14 text-[12.5px] font-semibold text-ink-2">
                {LANGUAGE_LABELS[key]}
              </span>
              <BeltStrip level={levels[key] ?? 0} size="sm" delay={0.1 + row * 0.05} />
              <span className="ml-auto">
                <BeltTag level={levels[key] ?? 0} compact />
              </span>
            </li>
          ))}
        </ul>
      </button>
    </motion.li>
  );
}

function ChangeBadge({ change }: { change: number }) {
  if (change === 0)
    return (
      <span className="inline-flex items-center text-[12px] text-faint">
        <Minus size={13} />
      </span>
    );
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular-nums ${
        change > 0
          ? "bg-success-soft text-success-text"
          : "bg-brand-soft text-brand-text"
      }`}
    >
      {change > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {Math.abs(change)}
    </span>
  );
}

// ─── Your position ────────────────────────────────────────────────────────────
function YouPill({
  you,
  scoreLabel,
}: {
  you: RankedStudent;
  scoreLabel: string;
}) {
  const [visible, setVisible] = useState(true);
  const observed = useRef(false);

  // Hide the pill while your own row is on screen.
  useEffect(() => {
    const row = document.getElementById("leaderboard-you");
    if (!row || observed.current) return;
    observed.current = true;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(!entry.isIntersecting),
    );
    observer.observe(row);
    return () => {
      observer.disconnect();
      observed.current = false;
    };
  }, [you.studentId]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 20, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: 20, x: "-50%" }}
          onClick={() =>
            document
              .getElementById("leaderboard-you")
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
          className="fixed bottom-6 left-1/2 z-40 flex items-center gap-3 rounded-full bg-ink px-5 py-3 font-display text-[14px] font-semibold text-page shadow-[var(--pop-shadow)]"
        >
          <span className="rounded-full bg-action px-2 py-0.5 text-[12px] text-white">
            #{you.rank}
          </span>
          You · {you.score} {scoreLabel}
          <ArrowDown size={15} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
