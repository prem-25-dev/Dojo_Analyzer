"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentUserProfile,
  type CurrentUserProfile,
} from "@/lib/auth/profile";
import { formatWeekLabel } from "@/lib/weeks";
import {
  FilterField,
  LeaderboardFilters,
  filterInputClass,
} from "@/components/leaderboard/filters";
import { LeaderboardExperience } from "@/components/leaderboard/leaderboard-experience";
import type { RankedStudent } from "@/components/leaderboard/types";
import { PageState as AccountState } from "@/components/ui/skeleton";
import { LanguageLogo } from "@/components/belts/belts";
import { useCachedProfile } from "@/lib/auth/use-cached-profile";

type Language = "cpp" | "java" | "nodejs" | "python";

type LeaderboardEntry = {
  rank: number;
  student_id: string;
  student_name: string | null;
  university_id: string | null;
  university_name: string | null;
  squad_number: string | null;
  belt_level: number;
  change: number;
};

type LeaderboardResponse = {
  language?: Language;
  week?: {
    id: string;
    week_number: number;
    academic_year: number;
    start_date: string;
    end_date: string;
  } | null;
  leaderboard?: LeaderboardEntry[];
  error?: string;
};

type WeekOption = {
  id: string;
  academic_year: number | null;
  week_number: number | null;
  start_date: string | null;
  end_date: string | null;
};

type PeriodsResponse = {
  weeks?: Array<{
    week_id: string;
    academic_year: number | null;
    week_number: number | null;
    start_date: string | null;
    end_date: string | null;
  }>;
};

type UniversityOption = {
  id: string;
  name: string;
};

const languageOptions: Array<{ value: Language; label: string }> = [
  { value: "cpp", label: "C++" },
  { value: "java", label: "Java" },
  { value: "nodejs", label: "Node.js" },
  { value: "python", label: "Python" },
];

export default function LanguageLeaderboardPage() {
  const router = useRouter();
  const cachedProfile = useCachedProfile();
  const [profileState, setProfileState] = useState<
    CurrentUserProfile | { status: "loading" }
  >(cachedProfile ?? { status: "loading" });
  const [language, setLanguage] = useState<Language>("python");
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [universities, setUniversities] = useState<UniversityOption[]>([]);
  const [selectedUniversityId, setSelectedUniversityId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selectedWeek, setSelectedWeek] =
    useState<LeaderboardResponse["week"]>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const result = await getCurrentUserProfile();
      if (isMounted) setProfileState(result);
    }

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (profileState.status === "unauthenticated") router.replace("/login");
    if (
      profileState.status === "authenticated" &&
      profileState.profile.role === "student"
    ) {
      router.replace("/student");
    }
  }, [profileState, router]);

  useEffect(() => {
    if (
      profileState.status !== "authenticated" ||
      profileState.profile.role !== "super_admin"
    )
      return;
    const controller = new AbortController();
    fetch("/api/super-admin/universities", { signal: controller.signal })
      .then((response) => response.json())
      .then((result: { universities?: UniversityOption[] }) =>
        setUniversities(result.universities ?? []),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [profileState]);

  useEffect(() => {
    if (profileState.status !== "authenticated") return;

    const controller = new AbortController();

    async function loadWeeks() {
      try {
        const response = await fetch("/api/dashboard/periods", {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = (await response.json()) as PeriodsResponse;
        const uniqueWeeks = new Map<string, WeekOption>();

        for (const item of result.weeks ?? []) {
          if (!uniqueWeeks.has(item.week_id)) {
            uniqueWeeks.set(item.week_id, {
              id: item.week_id,
              academic_year: item.academic_year,
              week_number: item.week_number,
              start_date: item.start_date,
              end_date: item.end_date,
            });
          }
        }

        setWeeks(
          Array.from(uniqueWeeks.values()).sort(
            (left, right) =>
              (right.academic_year ?? 0) - (left.academic_year ?? 0) ||
              (right.week_number ?? 0) - (left.week_number ?? 0),
          ),
        );
      } catch (loadError) {
        if (
          !(
            loadError instanceof DOMException && loadError.name === "AbortError"
          )
        ) {
          setWeeks([]);
        }
      }
    }

    loadWeeks();
    return () => controller.abort();
  }, [profileState]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (profileState.status !== "authenticated") return;

    const controller = new AbortController();
    const query = new URLSearchParams({ language });
    if (selectedWeekId) query.set("week_id", selectedWeekId);
    if (selectedUniversityId) query.set("university_id", selectedUniversityId);
    if (search) query.set("search", search);

    async function loadLeaderboard() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/leaderboard/language?${query.toString()}`,
          {
            signal: controller.signal,
          },
        );
        const result = (await response.json()) as LeaderboardResponse;
        if (!response.ok)
          throw new Error(result.error ?? "Unable to load the leaderboard.");

        const entries = result.leaderboard ?? [];
        setLeaderboard(entries);
        setSelectedWeek(result.week ?? null);
        setUniversities((current) => {
          const next = new Map(
            current.map((university) => [university.id, university]),
          );
          for (const entry of entries) {
            if (entry.university_id && entry.university_name) {
              next.set(entry.university_id, {
                id: entry.university_id,
                name: entry.university_name,
              });
            }
          }
          return Array.from(next.values()).sort((left, right) =>
            left.name.localeCompare(right.name),
          );
        });
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        )
          return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the leaderboard.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadLeaderboard();
    return () => controller.abort();
  }, [language, profileState, search, selectedUniversityId, selectedWeekId]);

  if (profileState.status === "loading")
    return <AccountState message="Checking your account..." loading />;
  if (profileState.status === "unauthenticated")
    return <AccountState message="Redirecting to login..." loading />;
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
    return (
      <AccountState
        message="Unable to load your account"
        detail={profileState.message}
      />
    );
  const currentProfile =
    profileState.status === "authenticated" ? profileState.profile : null;
  if (!currentProfile)
    return <AccountState message="Unable to determine your account role" />;
  if (currentProfile.role === "student")
    return <AccountState message="Redirecting to your student area..." loading />;

  const languageLabel =
    languageOptions.find((option) => option.value === language)?.label ??
    language;
  const displayWeek =
    weeks.find((week) => week.id === selectedWeek?.id) ??
    (!selectedWeekId ? weeks[0] : undefined);
  const weekLabel = displayWeek
    ? formatWeekLabel(displayWeek)
    : selectedWeek
      ? formatWeekLabel(selectedWeek)
      : "Latest week";

  const entries: RankedStudent[] = leaderboard.map((entry) => ({
    rank: entry.rank,
    studentId: entry.student_id,
    name: entry.student_name ?? "Unnamed student",
    squad: entry.squad_number,
    university: entry.university_name,
    score: entry.belt_level,
    change: entry.change,
  }));

  return (
    <LeaderboardExperience
      eyebrow={`${languageLabel} leaderboard · ${weekLabel}`}
      title={`${languageLabel} Black Belts`}
      subtitle={`Students ranked by their ${languageLabel} belt level.`}
      entries={entries}
      scoreLabel="level"
      language={language}
      isLoading={isLoading}
      error={error}
      currentStudentId={null}
      linkStudents
      emptyMessage="No students match the selected filters."
      controls={
        <LeaderboardFilters>
          <FilterField label="Language">
            <div className="flex h-10 gap-1 rounded-xl bg-ink/[0.045] p-1">
              {languageOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={language === option.value}
                  onClick={() => setLanguage(option.value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 font-display text-[13px] font-semibold transition ${
                    language === option.value
                      ? "bg-surface text-ink shadow-[var(--card-shadow)] ring-[0.5px] ring-line"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <LanguageLogo language={option.value} size={16} />
                  {option.label}
                </button>
              ))}
            </div>
          </FilterField>
          <FilterField label="Week">
            <select
              className={filterInputClass}
              value={selectedWeekId}
              onChange={(event) => setSelectedWeekId(event.target.value)}
            >
              <option value="">Latest week</option>
              {weeks.map((week) => (
                <option key={week.id} value={week.id}>
                  {formatWeekLabel(week)}
                </option>
              ))}
            </select>
          </FilterField>
          {currentProfile.role === "super_admin" && (
            <FilterField label="University">
              <select
                className={filterInputClass}
                value={selectedUniversityId}
                onChange={(event) =>
                  setSelectedUniversityId(event.target.value)
                }
              >
                <option value="">All universities</option>
                {universities.map((university) => (
                  <option key={university.id} value={university.id}>
                    {university.name}
                  </option>
                ))}
              </select>
            </FilterField>
          )}
          <FilterField label="Search" grow>
            <input
              className={filterInputClass}
              placeholder="Name, campus or squad…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </FilterField>
        </LeaderboardFilters>
      }
    />
  );
}

