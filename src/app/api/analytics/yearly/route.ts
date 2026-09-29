import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createRequestSupabaseClient } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const LANGUAGES = ["cpp", "java", "nodejs", "python"] as const;
type Language = (typeof LANGUAGES)[number];

type Membership = {
  student_id: string;
  squads:
    | { id: string; squad_number: string; university_id: string }
    | Array<{ id: string; squad_number: string; university_id: string }>
    | null;
};

type RecordRow = {
  student_id: string;
  week_id: string;
  final_belt_levels: Record<string, unknown> | null;
  weeks:
    | {
        id: string;
        university_id: string;
        academic_year: number;
        week_number: number;
        start_date: string;
      }
    | Array<{
        id: string;
        university_id: string;
        academic_year: number;
        week_number: number;
        start_date: string;
      }>
    | null;
};

type Levels = Record<Language, number>;
type ValidRecord = RecordRow & {
  levels: Levels;
  date: string;
  academicYear: number;
};
type LanguageMetric = {
  total_final: number;
  belts_earned: number;
  average_final: number | null;
};
type Scope = { universityId: string | null; studentId: string | null };

function nested<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseLevels(value: Record<string, unknown> | null): Levels | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const levels = {} as Levels;
  for (const language of LANGUAGES) {
    const parsed = numberValue(value[language]);
    if (parsed === null || parsed < 0) return null;
    levels[language] = parsed;
  }
  return levels;
}

function total(levels: Levels) {
  return LANGUAGES.reduce((sum, language) => sum + levels[language], 0);
}

function emptyLanguageMetrics(): Record<Language, LanguageMetric> {
  return LANGUAGES.reduce(
    (metrics, language) => {
      metrics[language] = {
        total_final: 0,
        belts_earned: 0,
        average_final: null,
      };
      return metrics;
    },
    {} as Record<Language, LanguageMetric>,
  );
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en", { month: "short" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function progression(previous: Levels | null, current: Levels) {
  if (
    !previous ||
    LANGUAGES.some((language) => current[language] < previous[language])
  )
    return null;
  return LANGUAGES.reduce(
    (earned, language) => earned + current[language] - previous[language],
    0,
  );
}

function latestByMonth(records: ValidRecord[], month: number) {
  const latest = new Map<string, ValidRecord>();
  for (const record of records) {
    if (Number(record.date.slice(5, 7)) !== month) continue;
    const previous = latest.get(record.student_id);
    if (!previous || record.date > previous.date)
      latest.set(record.student_id, record);
  }
  return latest;
}

function metricForMonth(
  monthRecords: Map<string, ValidRecord>,
  histories: Map<string, ValidRecord[]>,
  year: number,
  month: number,
) {
  let belts = 0;
  let earned = 0;
  let improved = 0;

  for (const [studentId, current] of monthRecords) {
    belts += total(current.levels);
    const history = histories.get(studentId) ?? [];
    let studentEarned = 0;
    for (const record of history) {
      if (
        record.academicYear !== year ||
        Number(record.date.slice(5, 7)) !== month
      )
        continue;
      const index = history.findIndex(
        (item) => item.week_id === record.week_id,
      );
      const previous = index > 0 ? history[index - 1] : null;
      const earnedForRecord = progression(
        previous?.levels ?? null,
        record.levels,
      );
      if (earnedForRecord !== null) studentEarned += earnedForRecord;
    }
    earned += studentEarned;
    if (studentEarned > 0) improved += 1;
  }

  return {
    total_students: monthRecords.size,
    total_belts: belts,
    belts_earned: earned,
    improved_students: improved,
    average_belts_per_student: monthRecords.size
      ? belts / monthRecords.size
      : null,
  };
}

export async function GET(request: Request) {
  try {
    const supabase = await createRequestSupabaseClient();
    const currentUser = await getCurrentUserProfile(supabase);

    if (currentUser.status === "unauthenticated") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    if (currentUser.status !== "authenticated") {
      return NextResponse.json(
        { error: "Analytics access is not authorized" },
        { status: 403 },
      );
    }
    const isSuperAdmin = currentUser.profile.role === "super_admin";
    if (
      !isSuperAdmin &&
      currentUser.profile.role !== "campus_manager" &&
      currentUser.profile.role !== "mentor"
    ) {
      return NextResponse.json(
        { error: "Analytics access is not authorized" },
        { status: 403 },
      );
    }
    if (!isSuperAdmin && !currentUser.profile.university_id) {
      return NextResponse.json(
        { error: "Analytics access is not authorized" },
        { status: 403 },
      );
    }

    const searchParams = new URL(request.url).searchParams;
    const requestedYear = searchParams.get("year");
    const requestedUniversity = searchParams.get("university_id");
    const requestedSquad = searchParams.get("squad_id");
    const scope: Scope = {
      universityId: isSuperAdmin
        ? requestedUniversity
        : currentUser.profile.university_id,
      studentId: null,
    };

    if (
      !isSuperAdmin &&
      requestedUniversity &&
      requestedUniversity !== scope.universityId
    ) {
      return NextResponse.json(
        { error: "University access is not authorized" },
        { status: 403 },
      );
    }

    if (requestedSquad) {
      let squadQuery = supabaseAdmin
        .from("squads")
        .select("id")
        .eq("id", requestedSquad);
      if (scope.universityId)
        squadQuery = squadQuery.eq("university_id", scope.universityId);
      const { data: squad, error: squadError } = await squadQuery.maybeSingle();

      if (squadError) throw squadError;
      if (!squad)
        return NextResponse.json(
          { error: "Squad access is not authorized" },
          { status: 403 },
        );
    }

    let membershipsQuery = supabaseAdmin
      .from("student_memberships")
      .select("student_id, squads!inner(id, squad_number, university_id)")
      .is("end_date", null)
      .order("start_date", { ascending: false });
    let recordsQuery = supabaseAdmin
      .from("weekly_belt_records")
      .select(
        "student_id, week_id, final_belt_levels, weeks!inner(id, university_id, academic_year, week_number, start_date), imports!inner(is_current)",
      )
      .eq("imports.is_current", true);
    let universitiesQuery = supabaseAdmin
      .from("universities")
      .select("id, name")
      .order("name");
    if (scope.universityId) {
      membershipsQuery = membershipsQuery.eq(
        "squads.university_id",
        scope.universityId,
      );
      recordsQuery = recordsQuery.eq("weeks.university_id", scope.universityId);
      universitiesQuery = universitiesQuery.eq("id", scope.universityId);
    }
    const [membershipsResult, recordsResult, universitiesResult] =
      await Promise.all([membershipsQuery, recordsQuery, universitiesQuery]);

    if (membershipsResult.error) throw membershipsResult.error;
    if (recordsResult.error) throw recordsResult.error;
    if (universitiesResult.error) throw universitiesResult.error;

    const membershipByStudent = new Map<string, Membership>();
    for (const membership of (membershipsResult.data ?? []) as Membership[]) {
      const squad = nested(membership.squads);
      if (
        (!scope.studentId || membership.student_id === scope.studentId) &&
        (!requestedSquad || squad?.id === requestedSquad) &&
        !membershipByStudent.has(membership.student_id)
      ) {
        membershipByStudent.set(membership.student_id, membership);
      }
    }

    const recordsByStudentWeek = new Map<string, ValidRecord>();
    for (const row of (recordsResult.data ?? []) as RecordRow[]) {
      if (!membershipByStudent.has(row.student_id)) continue;
      const week = nested(row.weeks);
      const levels = parseLevels(row.final_belt_levels);
      if (!week || !levels) continue;
      const key = `${row.student_id}:${row.week_id}`;
      if (!recordsByStudentWeek.has(key)) {
        recordsByStudentWeek.set(key, {
          ...row,
          levels,
          date: week.start_date,
          academicYear: week.academic_year,
        });
      }
    }

    const recordsByStudent = new Map<string, ValidRecord[]>();
    for (const record of recordsByStudentWeek.values()) {
      const records = recordsByStudent.get(record.student_id) ?? [];
      records.push(record);
      recordsByStudent.set(record.student_id, records);
    }
    for (const records of recordsByStudent.values()) {
      records.sort(
        (left, right) =>
          left.date.localeCompare(right.date) ||
          left.week_id.localeCompare(right.week_id),
      );
    }

    const availableYears = [
      ...new Set(
        [...recordsByStudentWeek.values()].map((record) => record.academicYear),
      ),
    ].sort((left, right) => right - left);
    const year = requestedYear
      ? Number(requestedYear)
      : (availableYears[0] ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000)
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });

    const yearRecords = [...recordsByStudentWeek.values()].filter(
      (record) => record.academicYear === year,
    );
    const availableMonths = [
      ...new Set(yearRecords.map((record) => Number(record.date.slice(5, 7)))),
    ].sort((left, right) => left - right);
    const squadOptionsById = new Map<
      string,
      { id: string; squad_number: string }
    >();
    for (const membership of membershipByStudent.values()) {
      const squad = nested(membership.squads);
      if (squad)
        squadOptionsById.set(squad.id, {
          id: squad.id,
          squad_number: squad.squad_number,
        });
    }

    const yearEndRecords = new Map<string, ValidRecord>();
    for (const record of yearRecords) {
      const previous = yearEndRecords.get(record.student_id);
      if (!previous || record.date > previous.date)
        yearEndRecords.set(record.student_id, record);
    }

    const yearlyMetrics = metricForMonth(
      yearEndRecords,
      recordsByStudent,
      year,
      -1,
    );
    let yearlyEarned = 0;
    const improvedStudents = new Set<string>();
    for (const [studentId, history] of recordsByStudent) {
      let studentEarned = 0;
      for (const record of history) {
        if (record.academicYear !== year) continue;
        const index = history.findIndex(
          (item) => item.week_id === record.week_id,
        );
        const previous = index > 0 ? history[index - 1] : null;
        const earnedForRecord = progression(
          previous?.levels ?? null,
          record.levels,
        );
        if (earnedForRecord !== null) studentEarned += earnedForRecord;
      }
      yearlyEarned += studentEarned;
      if (studentEarned > 0) improvedStudents.add(studentId);
    }

    const languageBreakdown = emptyLanguageMetrics();
    for (const record of yearEndRecords.values()) {
      for (const language of LANGUAGES)
        languageBreakdown[language].total_final += record.levels[language];
    }
    for (const [studentId, history] of recordsByStudent) {
      for (const record of history) {
        if (record.academicYear !== year) continue;
        const index = history.findIndex(
          (item) => item.week_id === record.week_id,
        );
        const previous = index > 0 ? history[index - 1] : null;
        if (
          !previous ||
          LANGUAGES.some(
            (language) => record.levels[language] < previous.levels[language],
          )
        )
          continue;
        for (const language of LANGUAGES) {
          languageBreakdown[language].belts_earned +=
            record.levels[language] - previous.levels[language];
        }
      }
      if (!yearEndRecords.has(studentId)) continue;
    }
    for (const language of LANGUAGES) {
      languageBreakdown[language].average_final = yearEndRecords.size
        ? languageBreakdown[language].total_final / yearEndRecords.size
        : null;
    }

    const monthlyTrend = availableMonths.map((month) => ({
      month,
      label: monthLabel(year, month),
      ...metricForMonth(
        latestByMonth(yearRecords, month),
        recordsByStudent,
        year,
        month,
      ),
    }));
    const filters = {
      year,
      years: availableYears,
      universities: universitiesResult.data ?? [],
      squads: Array.from(squadOptionsById.values()),
    };

    return NextResponse.json({
      filters,
      summary: {
        total_students: yearEndRecords.size,
        total_belts: yearlyMetrics.total_belts,
        belts_earned: yearlyEarned,
        improved_students: improvedStudents.size,
        average_belts_per_student: yearEndRecords.size
          ? yearlyMetrics.total_belts / yearEndRecords.size
          : null,
        no_change_students: Math.max(
          0,
          yearEndRecords.size - improvedStudents.size,
        ),
      },
      languageBreakdown,
      monthlyTrend,
    });
  } catch (error) {
    console.error("Yearly analytics GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
