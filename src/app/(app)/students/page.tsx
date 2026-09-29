"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  ArrowDownAZ,
  Copy,
  FileUp,
  LayoutGrid,
  List,
  Plus,
  Search,
  SearchX,
  UserPlus,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import {
  getCurrentUserProfile,
  type CurrentUserProfile,
} from "@/lib/auth/profile";
import { CsvUploadDialog } from "@/components/csv-upload-dialog";
import { CountUp } from "@/components/reactbits/count-up";
import { SpotlightCard } from "@/components/reactbits/spotlight-card";
import { ShinyButton } from "@/components/ui/shiny-button";
import { PageState, Skeleton } from "@/components/ui/skeleton";
import { Toast, type ToastMessage } from "@/components/ui/toast";
import { StudentAvatar } from "@/components/students/avatar";
import {
  StudentCollection,
  type CollectionView,
} from "@/components/students/student-collection";
import { EditStudentDialog } from "@/components/students/edit-student-dialog";
import { HistoryDialog } from "@/components/students/history-dialog";
import {
  CreateSquadDialog,
  CreateStudentDialog,
} from "@/components/students/create-dialogs";
import type { Language } from "@/lib/dashboard/metrics";
import type { StudentBelts } from "@/components/students/student-collection";
import type {
  Squad,
  Student,
  University,
  WeekStudent,
} from "@/components/students/types";
import { useCachedProfile } from "@/lib/auth/use-cached-profile";

type IssueFilter = "missing" | "incomplete";
type SortKey = "name" | "squad" | "recent";
type CreateDialog = "squad" | "student" | null;

const VIEW_KEY = "dojo-students-view";

export default function StudentsPage() {
  return (
    <Suspense
      fallback={<PageState message="Loading student management" loading />}
    >
      <StudentsPageContent />
    </Suspense>
  );
}

/** ISO date (yyyy-mm-dd) for `days` ago. */
function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function readView(): CollectionView {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

function StudentsPageContent() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const searchParams = useSearchParams();
  const requestedStatus = searchParams.get("status");
  const monitorView = searchParams.get("view") === "monitor";
  const requestedSquadNumber = searchParams.get("squad")?.trim() ?? "";
  const requestedAcademicYear = Number(searchParams.get("academicYear"));
  const requestedWeek = Number(searchParams.get("week"));
  const hasRequestedPeriod =
    Number.isInteger(requestedAcademicYear) &&
    requestedAcademicYear >= 2000 &&
    Number.isInteger(requestedWeek) &&
    requestedWeek >= 1;
  const issueFilter: IssueFilter | null =
    (requestedStatus === "missing" || requestedStatus === "incomplete") &&
    hasRequestedPeriod &&
    requestedWeek <= 52
      ? requestedStatus
      : null;
  const needsWeekData = Boolean(issueFilter || (monitorView && hasRequestedPeriod));

  const cachedProfile = useCachedProfile();

  const [profileState, setProfileState] = useState<
    CurrentUserProfile | { status: "loading" }
  >(cachedProfile ?? { status: "loading" });
  const [squads, setSquads] = useState<Squad[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [weekStudents, setWeekStudents] = useState<WeekStudent[] | null>(null);
  const [universities, setUniversities] = useState<University[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [universityFilter, setUniversityFilter] = useState("");
  const [squadFilter, setSquadFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [view, setView] = useState<CollectionView>(readView);
  const searchRef = useRef<HTMLInputElement>(null);

  const [csvOpen, setCsvOpen] = useState(false);
  const [csvSession, setCsvSession] = useState(0);
  const [createDialog, setCreateDialog] = useState<CreateDialog>(null);
  const [createSession, setCreateSession] = useState(0);
  const [editing, setEditing] = useState<Student | null>(null);
  const [historyFor, setHistoryFor] = useState<Student | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [belts, setBelts] = useState<Map<string, StudentBelts>>(new Map());
  const clearToast = useCallback(() => setToast(null), []);

  const toastId = useRef(0);
  function notify(message: string, tone: ToastMessage["tone"] = "success") {
    toastId.current += 1;
    setToast({ id: toastId.current, message, tone });
  }

  function chooseView(next: CollectionView) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage may be blocked; the choice still applies for this visit.
    }
  }

  useEffect(() => {
    let isMounted = true;
    getCurrentUserProfile().then((result) => {
      if (isMounted) setProfileState(result);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (profileState.status === "unauthenticated") router.replace("/login");
    if (
      profileState.status === "authenticated" &&
      profileState.profile.role === "student"
    )
      router.replace("/student");
  }, [profileState, router]);

  // "/" focuses search.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      )
        return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const role =
    profileState.status === "authenticated" ? profileState.profile.role : null;
  const canView =
    role === "campus_manager" || role === "mentor" || role === "super_admin";

  // Super admins need the university list for filters and create dialogs.
  useEffect(() => {
    if (role !== "super_admin") return;
    const controller = new AbortController();
    fetch("/api/super-admin/universities", { signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as {
          universities?: University[];
        };
        if (response.ok) setUniversities(result.universities ?? []);
      })
      .catch(() => {
        // The filter simply stays empty; the page still works.
      });
    return () => controller.abort();
  }, [role]);

  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();

    async function loadData() {
      setIsLoading(true);
      setLoadError("");
      setWeekStudents(null);
      try {
        const query = universityFilter
          ? `?university_id=${encodeURIComponent(universityFilter)}`
          : "";
        const squadQuery = role === "super_admin" ? "" : query;
        const [squadsResponse, studentsResponse, dashboardResponse] =
          await Promise.all([
            fetch(`/api/squads${squadQuery}`, { signal: controller.signal }),
            fetch(`/api/students${query}`, { signal: controller.signal }),
            needsWeekData
              ? fetch(
                  `/api/dashboard?academicYear=${requestedAcademicYear}&weekNumber=${requestedWeek}`,
                  { signal: controller.signal },
                )
              : Promise.resolve(null),
          ]);
        const squadsResult = (await squadsResponse.json()) as {
          squads?: Squad[];
          error?: string;
        };
        const studentsResult = (await studentsResponse.json()) as {
          students?: Student[];
          error?: string;
        };
        if (!squadsResponse.ok)
          throw new Error(squadsResult.error ?? "Unable to load squads.");
        if (!studentsResponse.ok)
          throw new Error(studentsResult.error ?? "Unable to load students.");
        if (dashboardResponse && !dashboardResponse.ok) {
          const result = (await dashboardResponse.json()) as { error?: string };
          throw new Error(result.error ?? "Unable to load weekly student data.");
        }
        const dashboardResult = dashboardResponse
          ? ((await dashboardResponse.json()) as { students?: WeekStudent[] })
          : null;

        setSquads(squadsResult.squads ?? []);
        setStudents(studentsResult.students ?? []);
        setWeekStudents(dashboardResult?.students ?? null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(
          error instanceof Error ? error.message : "Unable to load management data.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadData();
    return () => controller.abort();
  }, [
    canView,
    needsWeekData,
    refreshKey,
    requestedAcademicYear,
    requestedWeek,
    role,
    universityFilter,
  ]);

  // Latest belts per student (from the overall leaderboard), for cards and profiles.
  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    const query = universityFilter
      ? `?university_id=${encodeURIComponent(universityFilter)}`
      : "";
    fetch(`/api/leaderboard/overall${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { leaderboard: [] }))
      .then(
        (result: {
          leaderboard?: Array<{
            rank: number;
            student_id: string;
            language_belts: Record<Language, number>;
            total_belts_earned: number;
          }>;
        }) =>
          setBelts(
            new Map(
              (result.leaderboard ?? []).map((row) => [
                row.student_id,
                { rank: row.rank, levels: row.language_belts, total: row.total_belts_earned },
              ]),
            ),
          ),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [canView, universityFilter, refreshKey]);

  const derived = useMemo(() => {
    const weekById = new Map(
      (weekStudents ?? []).map((student) => [student.student_id, student]),
    );
    const missingIds = new Set(
      (weekStudents ?? [])
        .filter((student) => !student.has_weekly_data)
        .map((student) => student.student_id),
    );
    const coverageBySquad = new Map<string, { total: number; recorded: number }>();
    for (const student of weekStudents ?? []) {
      if (!student.squad_number) continue;
      const coverage = coverageBySquad.get(student.squad_number) ?? {
        total: 0,
        recorded: 0,
      };
      coverage.total += 1;
      coverage.recorded += student.has_weekly_data ? 1 : 0;
      coverageBySquad.set(student.squad_number, coverage);
    }
    const incomplete = new Set(
      Array.from(coverageBySquad.entries())
        .filter(([, coverage]) => coverage.recorded < coverage.total)
        .map(([squadNumber]) => squadNumber),
    );

    const visibleSquads = (
      issueFilter === "incomplete"
        ? squads.filter((squad) => incomplete.has(squad.squad_number))
        : requestedSquadNumber
          ? squads.filter((squad) => squad.squad_number === requestedSquadNumber)
          : squads
    ).filter(
      (squad) => !universityFilter || squad.university_id === universityFilter,
    );
    const visibleStudents =
      issueFilter === "missing"
        ? students.filter((student) => missingIds.has(student.id))
        : issueFilter === "incomplete"
          ? students.filter((student) =>
              incomplete.has(student.squad_number ?? ""),
            )
          : requestedSquadNumber
            ? students.filter(
                (student) => student.squad_number === requestedSquadNumber,
              )
            : students;

    const countBySquad = new Map<string, number>();
    for (const student of visibleStudents) {
      if (!student.squad_id) continue;
      countBySquad.set(
        student.squad_id,
        (countBySquad.get(student.squad_id) ?? 0) + 1,
      );
    }

    const term = search.trim().toLowerCase();
    const filtered = visibleStudents
      .filter(
        (student) =>
          (!squadFilter || student.squad_id === squadFilter) &&
          (!term ||
            `${student.name ?? ""} ${student.email ?? ""}`
              .toLowerCase()
              .includes(term)),
      )
      .sort((a, b) => {
        if (sort === "recent")
          return (b.start_date ?? "").localeCompare(a.start_date ?? "");
        if (sort === "squad") {
          const bySquad = (a.squad_number ?? "").localeCompare(
            b.squad_number ?? "",
            undefined,
            { numeric: true },
          );
          if (bySquad) return bySquad;
        }
        return (a.name ?? "").localeCompare(b.name ?? "");
      });

    const monthAgo = daysAgo(30);
    return {
      weekById,
      missingIds,
      coverageBySquad,
      visibleSquads,
      visibleStudents,
      countBySquad,
      filtered,
      newThisMonth: visibleStudents.filter(
        (student) => (student.start_date ?? "") >= monthAgo,
      ).length,
      assigned: visibleStudents.filter((student) => student.squad_id).length,
    };
  }, [
    issueFilter,
    requestedSquadNumber,
    search,
    sort,
    squadFilter,
    squads,
    students,
    universityFilter,
    weekStudents,
  ]);

  const takenEmails = useMemo(
    () =>
      new Set(
        students
          .filter((student) => student.id !== editing?.id && student.email)
          .map((student) => (student.email ?? "").toLowerCase()),
      ),
    [students, editing],
  );

  if (profileState.status === "loading")
    return <PageState message="Checking your account" loading />;
  if (profileState.status === "unauthenticated")
    return <PageState message="Redirecting to login" loading />;
  if (profileState.status === "unassigned")
    return (
      <PageState
        message="Account not assigned"
        detail="Your account does not have an assigned profile yet."
      />
    );
  if (profileState.status === "invalid_role")
    return <PageState message="Account role not supported" />;
  if (profileState.status === "error")
    return (
      <PageState
        message="Unable to load your account"
        detail={profileState.message}
      />
    );
  const currentProfile =
    profileState.status === "authenticated" ? profileState.profile : null;
  if (!currentProfile)
    return <PageState message="Unable to determine your account role" />;
  if (currentProfile.role === "student")
    return <PageState message="Redirecting to your student area" loading />;

  const isSuperAdmin = currentProfile.role === "super_admin";
  const isCampusManager = currentProfile.role === "campus_manager";
  const isManager = isSuperAdmin || isCampusManager;
  const {
    weekById,
    missingIds,
    coverageBySquad,
    visibleSquads,
    visibleStudents,
    countBySquad,
    filtered,
    newThisMonth,
    assigned,
  } = derived;
  const issueDataUnavailable = needsWeekData && !isLoading && !weekStudents;
  const scoped = Boolean(issueFilter || monitorView || requestedSquadNumber);
  const activeSquad = squads.find((squad) => squad.id === squadFilter);

  const defaultUniversityId =
    universityFilter ||
    squads.find((squad) => squad.university_id)?.university_id ||
    universities[0]?.id ||
    "";

  function openCreate(kind: Exclude<CreateDialog, null>) {
    setCreateSession((current) => current + 1);
    setCreateDialog(kind);
  }

  const stats = [
    {
      label: "Students",
      value: visibleStudents.length,
      hint: scoped ? "in this view" : "enrolled",
      icon: UsersRound,
      tint: "var(--series-1)",
    },
    {
      label: "Squads",
      value: visibleSquads.length,
      hint: `${assigned} students assigned`,
      icon: Users,
      tint: "var(--series-3)",
    },
    {
      label: "Avg squad size",
      value: visibleSquads.length ? assigned / visibleSquads.length : 0,
      decimals: 1,
      hint: "students per squad",
      icon: LayoutGrid,
      tint: "var(--series-7)",
    },
    needsWeekData && weekStudents
      ? {
          label: "Missing this week",
          value: visibleStudents.filter((student) => missingIds.has(student.id))
            .length,
          hint: `week ${requestedWeek}, ${requestedAcademicYear}`,
          icon: AlertTriangle,
          tint: "var(--series-4)",
        }
      : {
          label: "New this month",
          value: newThisMonth,
          hint: "joined in the last 30 days",
          icon: UserPlus,
          tint: "var(--series-2)",
        },
  ];

  const bannerTitle =
    issueFilter === "missing"
      ? "Students missing this week's data"
      : issueFilter === "incomplete"
        ? "Squads with incomplete weekly data"
        : requestedSquadNumber
          ? `Students in Squad ${requestedSquadNumber}`
          : "Campus monitoring view";

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-16 lg:px-8">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative mt-2 overflow-hidden rounded-3xl border border-line bg-surface px-6 py-7 shadow-[var(--card-shadow)] sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_65%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--brand) 20%, transparent), transparent 70%)",
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text">
              {isSuperAdmin
                ? "Global management"
                : isManager
                  ? "Dojo operations"
                  : "Campus monitoring"}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.035em] sm:text-[40px] sm:leading-[1.05]">
              {isCampusManager
                ? "Students & squads"
                : isSuperAdmin
                  ? "Every student, every squad"
                  : "Campus students"}
            </h1>
            <p className="mt-2 text-[14px] leading-6 text-muted">
              {isSuperAdmin
                ? "Manage students and squads across every university."
                : isManager
                  ? "Add, move and review the students connected to your campus."
                  : "Review students across your campus and open their belt history."}
            </p>
            {students.length ? (
              <div className="mt-4 flex items-center gap-3">
                <div className="flex -space-x-2">
                  {students.slice(0, 5).map((student, index) => (
                    <motion.span
                      key={student.id}
                      initial={reduced ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + index * 0.05 }}
                    >
                      <StudentAvatar
                        id={student.id}
                        name={student.name}
                        size={30}
                        ring
                      />
                    </motion.span>
                  ))}
                </div>
                <span className="text-[12.5px] text-muted">
                  {students.length > 5
                    ? `+${students.length - 5} more in your dojo`
                    : "in your dojo"}
                </span>
              </div>
            ) : null}
          </div>
          {isManager ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openCreate("squad")}
                className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-ink-2 transition hover:border-ink/40 hover:text-ink active:scale-[0.98]"
              >
                <Plus size={15} /> New squad
              </button>
              <button
                type="button"
                onClick={() => openCreate("student")}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-page transition hover:opacity-90 active:scale-[0.98]"
              >
                <UserPlus size={15} /> Add student
              </button>
              <ShinyButton
                className="h-10 px-4 font-display text-[13.5px] font-semibold"
                onClick={() => {
                  setCsvSession((current) => current + 1);
                  setCsvOpen(true);
                }}
              >
                <FileUp size={15} /> Import CSV
              </ShinyButton>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index }}
          >
            <SpotlightCard className="h-full p-4">
              <span
                className="grid h-9 w-9 place-items-center rounded-xl"
                style={{
                  color: stat.tint,
                  background: `color-mix(in srgb, ${stat.tint} 13%, transparent)`,
                }}
              >
                <stat.icon size={17} />
              </span>
              <div className="mt-3 h-7 font-display text-[28px] font-bold leading-none tracking-[-0.035em] tabular-nums">
                {isLoading ? (
                  <Skeleton className="h-7 w-14" />
                ) : (
                  <CountUp to={stat.value} decimals={stat.decimals ?? 0} />
                )}
              </div>
              <p className="mt-1.5 text-[13px] font-semibold text-ink-2">
                {stat.label}
              </p>
              <p className="text-[11.5px] text-muted">{stat.hint}</p>
            </SpotlightCard>
          </motion.div>
        ))}
      </div>

      {/* ── Banners ─────────────────────────────────────────── */}
      <AnimatePresence>
        {loadError ? (
          <motion.div
            key="error"
            role="alert"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-brand-line bg-brand-soft px-4 py-3 text-sm text-brand-text"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={16} /> {loadError}
            </span>
            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
              className="font-semibold underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {scoped ? (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-text/25 bg-warning-soft px-4 py-3 text-sm"
        >
          <p className="flex flex-wrap items-center gap-2 text-ink">
            <AlertTriangle size={16} className="text-warning-text" />
            <span className="font-semibold">{bannerTitle}</span>
            {hasRequestedPeriod ? (
              <span className="text-muted">
                Academic year {requestedAcademicYear}, week {requestedWeek}
              </span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => router.replace("/students")}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12.5px] font-semibold text-ink-2 shadow-[var(--card-shadow)] transition hover:text-ink"
          >
            <X size={13} /> Clear filter
          </button>
        </motion.div>
      ) : null}

      {/* ── Squad rail ──────────────────────────────────────── */}
      <section className="mt-6">
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[15px] font-semibold">Squads</h2>
          {activeSquad && isCampusManager ? (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(activeSquad.id)
                  .then(() => notify("Squad ID copied"))
                  .catch(() => notify("Couldn’t copy the ID", "error"));
              }}
              className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-muted transition hover:text-ink"
              title="Copy squad ID"
            >
              <Copy size={12} /> {activeSquad.id.slice(0, 8)}…
            </button>
          ) : null}
        </div>
        {isLoading ? (
          <div className="flex gap-2 overflow-hidden">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-11 w-28 shrink-0 rounded-2xl" />
            ))}
          </div>
        ) : issueDataUnavailable ? (
          <p className="text-sm text-muted">
            Weekly data is unavailable for this period.
          </p>
        ) : visibleSquads.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong px-4 py-4 text-sm text-muted">
            {issueFilter === "incomplete"
              ? "No incomplete squads for this week."
              : isManager
                ? "No squads yet — create one to start adding students."
                : "No squads have been created yet."}
          </p>
        ) : (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
            <SquadChip
              active={!squadFilter}
              onClick={() => setSquadFilter("")}
              label="All squads"
              count={visibleStudents.length}
            />
            {visibleSquads.map((squad) => {
              const coverage = coverageBySquad.get(squad.squad_number);
              return (
                <SquadChip
                  key={squad.id}
                  active={squadFilter === squad.id}
                  onClick={() =>
                    setSquadFilter((current) =>
                      current === squad.id ? "" : squad.id,
                    )
                  }
                  label={`Squad ${squad.squad_number}`}
                  sub={
                    isSuperAdmin && !universityFilter
                      ? (squad.university_name ?? undefined)
                      : undefined
                  }
                  count={countBySquad.get(squad.id) ?? 0}
                  coverage={monitorView ? coverage : undefined}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="sticky top-[76px] z-20 mt-4 rounded-2xl border border-line bg-surface/85 p-2 shadow-[var(--card-shadow)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearch("");
                  event.currentTarget.blur();
                }
              }}
              placeholder="Search by name or email"
              aria-label="Search students"
              className="w-full rounded-xl border border-transparent bg-sunken py-2 pl-9 pr-16 text-[13.5px] outline-none transition placeholder:text-faint focus:border-line-strong focus:bg-surface"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-line-strong bg-surface px-1.5 font-mono text-[11px] text-muted">
                /
              </kbd>
            )}
          </div>
          {isSuperAdmin ? (
            <ToolbarSelect
              label="University"
              value={universityFilter}
              onChange={(value) => {
                setUniversityFilter(value);
                setSquadFilter("");
              }}
            >
              <option value="">All universities</option>
              {universities.map((university) => (
                <option key={university.id} value={university.id}>
                  {university.name}
                </option>
              ))}
            </ToolbarSelect>
          ) : null}
          <ToolbarSelect
            label="Sort"
            value={sort}
            onChange={(value) => setSort(value as SortKey)}
            icon={<ArrowDownAZ size={14} />}
          >
            <option value="name">Name A–Z</option>
            <option value="squad">Squad</option>
            <option value="recent">Recently joined</option>
          </ToolbarSelect>
          <div
            role="radiogroup"
            aria-label="Layout"
            className="flex rounded-xl bg-sunken p-1"
          >
            {(
              [
                ["cards", LayoutGrid, "Cards"],
                ["list", List, "List"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={view === id}
                onClick={() => chooseView(id)}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${view === id ? "text-ink" : "text-muted hover:text-ink-2"}`}
              >
                {view === id ? (
                  <motion.span
                    layoutId="students-view"
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
      </div>

      <div className="mb-3 mt-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
        {isLoading ? (
          <Skeleton className="h-3 w-40" />
        ) : (
          <>
            <span>
              Showing{" "}
              <span className="font-semibold text-ink">{filtered.length}</span>{" "}
              of {visibleStudents.length} students
            </span>
            {activeSquad ? (
              <FilterPill
                label={`Squad ${activeSquad.squad_number}`}
                onClear={() => setSquadFilter("")}
              />
            ) : null}
            {search.trim() ? (
              <FilterPill
                label={`“${search.trim()}”`}
                onClear={() => setSearch("")}
              />
            ) : null}
          </>
        )}
      </div>

      {/* ── Students ────────────────────────────────────────── */}
      {isLoading ? (
        <CollectionSkeleton view={view} />
      ) : issueDataUnavailable ? (
        <EmptyPanel
          title="No weekly data for this period"
          detail="Import this week's CSV to see who is missing data."
        />
      ) : filtered.length === 0 ? (
        <EmptyPanel
          title={
            issueFilter === "missing"
              ? "Everyone has data this week"
              : visibleStudents.length === 0
                ? "No students yet"
                : "No matches"
          }
          detail={
            issueFilter === "missing"
              ? "No students are missing data for this week."
              : visibleStudents.length === 0
                ? isManager
                  ? "Add a student or import a CSV to get started."
                  : "Students will appear here once they are added."
                : "Try a different name, email or squad."
          }
          action={
            visibleStudents.length > 0 && (search || squadFilter) ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSquadFilter("");
                }}
                className="rounded-full border border-line-strong px-3.5 py-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink"
              >
                Clear search & squad
              </button>
            ) : null
          }
        />
      ) : (
        <StudentCollection
          key={`${squadFilter}|${search.trim()}|${sort}|${universityFilter}`}
          students={filtered}
          view={view}
          monitor={monitorView && Boolean(weekStudents)}
          weekById={weekById}
          showUniversity={isSuperAdmin && !universityFilter}
          canEdit={isManager}
          onEdit={setEditing}
          onHistory={setHistoryFor}
          belts={belts}
          onSquad={setSquadFilter}
        />
      )}

      {/* ── Dialogs ─────────────────────────────────────────── */}
      <HistoryDialog
        student={historyFor}
        onClose={() => setHistoryFor(null)}
        snapshot={
          historyFor && belts.get(historyFor.id)
            ? {
                rank: belts.get(historyFor.id)!.rank,
                score: belts.get(historyFor.id)!.total,
                scoreLabel: "belts",
                levels: belts.get(historyFor.id)!.levels,
              }
            : undefined
        }
      />
      {isManager ? (
        <>
          <EditStudentDialog
            student={editing}
            squads={
              isSuperAdmin && editing
                ? squads.filter(
                    (squad) =>
                      squad.university_name === editing.university_name,
                  )
                : squads
            }
            takenEmails={takenEmails}
            showUniversity={false}
            onClose={() => setEditing(null)}
            onSaved={(name) => {
              setEditing(null);
              notify(`${name} updated`);
              setRefreshKey((current) => current + 1);
            }}
          />
          <CreateSquadDialog
            key={`squad-${createSession}`}
            open={createDialog === "squad"}
            onClose={() => setCreateDialog(null)}
            squads={squads}
            universities={isSuperAdmin ? universities : null}
            defaultUniversityId={defaultUniversityId}
            onCreated={(message) => {
              setCreateDialog(null);
              notify(message);
              setRefreshKey((current) => current + 1);
            }}
          />
          <CreateStudentDialog
            key={`student-${createSession}`}
            open={createDialog === "student"}
            onClose={() => setCreateDialog(null)}
            squads={squads}
            universities={isSuperAdmin ? universities : null}
            defaultUniversityId={defaultUniversityId}
            defaultSquadId={squadFilter || undefined}
            takenEmails={
              new Set(
                students.map((student) => (student.email ?? "").toLowerCase()),
              )
            }
            onCreated={(message) => {
              setCreateDialog(null);
              notify(message);
              setRefreshKey((current) => current + 1);
            }}
          />
          <CsvUploadDialog
            key={csvSession}
            open={csvOpen}
            onClose={() => setCsvOpen(false)}
            requireUniversity={isSuperAdmin}
            mode="manage-squads"
            onComplete={() => setRefreshKey((current) => current + 1)}
          />
        </>
      ) : null}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}

function SquadChip({
  active,
  onClick,
  label,
  sub,
  count,
  coverage,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub?: string;
  count: number;
  coverage?: { total: number; recorded: number };
}) {
  const ratio = coverage?.total ? coverage.recorded / coverage.total : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative shrink-0 rounded-2xl border px-3.5 py-2 text-left transition active:scale-[0.98] ${
        active
          ? "border-ink bg-ink text-page shadow-[0_8px_20px_-10px_rgba(0,0,0,0.45)]"
          : "border-line bg-surface text-ink hover:border-line-strong hover:shadow-[var(--card-shadow)]"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="text-[13px] font-semibold">{label}</span>
        <span
          className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${active ? "bg-page/15" : "bg-sunken text-muted"}`}
        >
          {count}
        </span>
      </span>
      {sub ? (
        <span
          className={`block max-w-[160px] truncate text-[11px] ${active ? "text-page/70" : "text-muted"}`}
        >
          {sub}
        </span>
      ) : null}
      {ratio !== null ? (
        <span className="mt-1.5 flex items-center gap-1.5">
          <span
            className={`h-1 w-16 overflow-hidden rounded-full ${active ? "bg-page/20" : "bg-sunken"}`}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${ratio * 100}%`,
                background:
                  ratio === 1 ? "var(--status-up)" : "var(--series-4)",
              }}
            />
          </span>
          <span
            className={`text-[10.5px] tabular-nums ${active ? "text-page/70" : "text-muted"}`}
          >
            {coverage?.recorded}/{coverage?.total}
          </span>
        </span>
      ) : null}
    </button>
  );
}

function ToolbarSelect({
  label,
  value,
  onChange,
  icon,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{label}</span>
      {icon ? (
        <span className="pointer-events-none absolute left-2.5 text-muted">
          {icon}
        </span>
      ) : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`max-w-[220px] cursor-pointer appearance-none rounded-xl border border-transparent bg-sunken py-2 pr-7 text-[13px] font-semibold text-ink-2 outline-none transition hover:text-ink focus:border-line-strong ${icon ? "pl-8" : "pl-3"}`}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-2.5 h-3 w-3 text-muted"
      >
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </label>
  );
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-0.5 pl-2.5 pr-1 text-[12px] font-semibold text-ink-2"
    >
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label} filter`}
        className="grid h-4 w-4 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink"
      >
        <X size={11} />
      </button>
    </motion.span>
  );
}

function EmptyPanel({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center"
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sunken text-muted">
        <SearchX size={22} />
      </span>
      <p className="mt-4 font-display text-lg font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </motion.div>
  );
}

function CollectionSkeleton({ view }: { view: CollectionView }) {
  if (view === "list")
    return (
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-0"
          >
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3" style={{ width: `${30 + (i % 3) * 8}%` }} />
              <Skeleton className="h-2.5 w-1/4" />
            </div>
            <Skeleton className="hidden h-6 w-14 rounded-full md:block" />
            <Skeleton className="h-7 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    );
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }, (_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-line bg-surface p-4"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5" style={{ width: `${50 + (i % 3) * 10}%` }} />
              <Skeleton className="h-2.5 w-2/3" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-dashed border-line pt-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
