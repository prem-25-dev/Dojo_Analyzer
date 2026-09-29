import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createRequestSupabaseClient } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/server";

type MembershipRow = {
  student_id: string;
  students:
    | { id: string; name: string | null; email: string | null }
    | Array<{ id: string; name: string | null; email: string | null }>
    | null;
  squads:
    | { squad_number: string; university_id: string }
    | Array<{ squad_number: string; university_id: string }>
    | null;
};

type WeekRow = {
  id: string;
  university_id: string;
  academic_year: number;
  week_number: number;
};

type BeltRecord = {
  student_id: string;
  week_id: string;
  final_belt_levels: Record<string, unknown> | null;
};

type LanguageBelts = {
  cpp: number;
  java: number;
  nodejs: number;
  python: number;
};

const PAGE_SIZE = 500;

async function loadAllPages<T>(
  loadPage: (from: number, to: number) => Promise<T[]>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await loadPage(from, from + PAGE_SIZE - 1);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function getNestedValue<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function getLevel(value: unknown) {
  const level = Number(value);
  return Number.isFinite(level) ? level : 0;
}

function getLanguageBelts(
  finalLevels: Record<string, unknown> | null,
): LanguageBelts {
  return {
    cpp: getLevel(finalLevels?.cpp),
    java: getLevel(finalLevels?.java),
    nodejs: getLevel(finalLevels?.nodejs),
    python: getLevel(finalLevels?.python),
  };
}

function addLanguageBelts(target: LanguageBelts, source: LanguageBelts) {
  target.cpp += source.cpp;
  target.java += source.java;
  target.nodejs += source.nodejs;
  target.python += source.python;
}

function totalBelts(languageBelts: LanguageBelts) {
  return (
    languageBelts.cpp +
    languageBelts.java +
    languageBelts.nodejs +
    languageBelts.python
  );
}

function comparePeriods(left: WeekRow, right: WeekRow) {
  if (left.academic_year !== right.academic_year) {
    return left.academic_year - right.academic_year;
  }

  return left.week_number - right.week_number;
}

function samePeriod(left: WeekRow, right: WeekRow) {
  return (
    left.academic_year === right.academic_year &&
    left.week_number === right.week_number
  );
}

function emptyLanguageBelts(): LanguageBelts {
  return { cpp: 0, java: 0, nodejs: 0, python: 0 };
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
        { error: "Account profile is not assigned" },
        { status: 403 },
      );
    }

    const role = currentUser.profile.role;
    const isStudent = role === "student";
    const isSuperAdmin = role === "super_admin";
    const isUniversityScopedRole =
      role === "campus_manager" || role === "mentor";
    if (!isStudent && !isSuperAdmin && !isUniversityScopedRole) {
      return NextResponse.json(
        { error: "Leaderboard access is not authorized" },
        { status: 403 },
      );
    }
    const authenticatedUniversityId = currentUser.profile.university_id;
    if (
      (isStudent && !currentUser.profile.student_id) ||
      (!isStudent && !isSuperAdmin && !authenticatedUniversityId)
    ) {
      return NextResponse.json(
        { error: "Leaderboard access is not authorized" },
        { status: 403 },
      );
    }

    const searchParams = new URL(request.url).searchParams;
    const weekId = searchParams.get("week_id")?.trim() || null;
    const requestedUniversityId =
      searchParams.get("university_id")?.trim() || null;
    const universityId = isStudent ? null : requestedUniversityId;
    const search = isStudent
      ? ""
      : searchParams.get("search")?.trim().toLowerCase() || "";

    if (
      !isStudent &&
      !isSuperAdmin &&
      universityId &&
      universityId !== authenticatedUniversityId
    ) {
      return NextResponse.json(
        { error: "University access is not authorized" },
        { status: 403 },
      );
    }

    const [memberships, weeks] = await Promise.all([
      loadAllPages(async (from, to) => {
        let query = supabaseAdmin
          .from("student_memberships")
          .select(
            "student_id, students!inner(id, name, email), squads!inner(squad_number, university_id)",
          )
          .is("end_date", null)
          .order("start_date", { ascending: false });
        if (!isStudent && !isSuperAdmin) {
          query = query.eq("squads.university_id", authenticatedUniversityId!);
        } else if (universityId) {
          query = query.eq("squads.university_id", universityId);
        }
        const { data, error } = await query.range(from, to);
        if (error) throw error;
        return (data ?? []) as MembershipRow[];
      }),
      loadAllPages(async (from, to) => {
        let query = supabaseAdmin
          .from("weeks")
          .select(
            "id, university_id, academic_year, week_number, imports!inner(is_current, status)",
          )
          .eq("imports.is_current", true)
          .eq("imports.status", "imported")
          .order("academic_year", { ascending: true })
          .order("week_number", { ascending: true });
        if (!isStudent && !isSuperAdmin) {
          query = query.eq("university_id", authenticatedUniversityId!);
        } else if (universityId) {
          query = query.eq("university_id", universityId);
        }
        const { data, error } = await query.range(from, to);
        if (error) throw error;
        return (data ?? []) as WeekRow[];
      }),
    ]);

    const membershipsByStudent = new Map<string, MembershipRow>();

    for (const membership of memberships) {
      if (!membershipsByStudent.has(membership.student_id)) {
        membershipsByStudent.set(membership.student_id, membership);
      }
    }

    const uniqueMemberships = Array.from(membershipsByStudent.values());
    const selectedWeek = weekId
      ? (weeks.find((week) => week.id === weekId) ?? null)
      : ([...weeks].sort((left, right) => comparePeriods(right, left))[0] ??
        null);

    if (weekId && !selectedWeek) {
      return NextResponse.json({ error: "Week not found" }, { status: 404 });
    }

    const previousWeek = selectedWeek
      ? ([...weeks]
          .filter((week) => {
            if (
              weekId &&
              !isStudent &&
              !(isSuperAdmin && !universityId) &&
              week.university_id !== selectedWeek.university_id
            ) {
              return false;
            }

            return comparePeriods(week, selectedWeek) < 0;
          })
          .sort((left, right) => comparePeriods(right, left))[0] ?? null)
      : null;

    const selectedWeekIds = new Set(
      selectedWeek
        ? weekId && !isStudent && !(isSuperAdmin && !universityId)
          ? [selectedWeek.id]
          : weeks
              .filter((week) => samePeriod(week, selectedWeek))
              .map((week) => week.id)
        : [],
    );
    const previousWeekIds = new Set(
      previousWeek
        ? weekId && !isStudent && !(isSuperAdmin && !universityId)
          ? [previousWeek.id]
          : weeks
              .filter((week) => samePeriod(week, previousWeek))
              .map((week) => week.id)
        : [],
    );
    const recordWeekIds = [
      ...new Set([...selectedWeekIds, ...previousWeekIds]),
    ];
    const universityIds = [
      ...new Set(
        uniqueMemberships
          .map((membership) => getNestedValue(membership.squads)?.university_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [universities, records] = await Promise.all([
      universityIds.length > 0
        ? loadAllPages(async (from, to) => {
            const { data, error } = await supabaseAdmin
              .from("universities")
              .select("id, name")
              .in("id", universityIds)
              .order("id", { ascending: true })
              .range(from, to);
            if (error) throw error;
            return data ?? [];
          })
        : Promise.resolve([]),
      recordWeekIds.length > 0
        ? loadAllPages(async (from, to) => {
            const { data, error } = await supabaseAdmin
              .from("weekly_belt_records")
              .select(
                "student_id, week_id, final_belt_levels, imports!inner(is_current, status)",
              )
              .in("week_id", recordWeekIds)
              .eq("imports.is_current", true)
              .eq("imports.status", "imported")
              .order("week_id", { ascending: true })
              .order("student_id", { ascending: true })
              .range(from, to);
            if (error) throw error;
            return (data ?? []) as BeltRecord[];
          })
        : Promise.resolve([]),
    ]);

    const universityNames = new Map(
      universities.map((university) => [university.id, university.name]),
    );
    const recordsByStudentWeek = new Map<string, BeltRecord>();

    for (const record of records) {
      const key = `${record.student_id}:${record.week_id}`;
      if (!recordsByStudentWeek.has(key)) {
        recordsByStudentWeek.set(key, record);
      }
    }

    const selectedScores = new Map<string, LanguageBelts>();
    const previousScores = new Map<string, LanguageBelts>();

    for (const record of recordsByStudentWeek.values()) {
      const scores = selectedWeekIds.has(record.week_id)
        ? selectedScores
        : previousScores;
      const languageBelts =
        scores.get(record.student_id) ?? emptyLanguageBelts();
      addLanguageBelts(
        languageBelts,
        getLanguageBelts(record.final_belt_levels),
      );
      scores.set(record.student_id, languageBelts);
    }

    const filteredEntries = uniqueMemberships
      .map((membership) => {
        const student = getNestedValue(membership.students);
        const squad = getNestedValue(membership.squads);
        const entryUniversityId = squad?.university_id ?? null;
        const languageBelts =
          selectedScores.get(membership.student_id) ?? emptyLanguageBelts();
        const previousLanguageBelts =
          previousScores.get(membership.student_id) ?? emptyLanguageBelts();
        const entry = {
          student_id: student?.id ?? membership.student_id,
          student_name: student?.name ?? null,
          email: student?.email ?? null,
          university_id: entryUniversityId,
          university_name: entryUniversityId
            ? (universityNames.get(entryUniversityId) ?? null)
            : null,
          squad_number: squad?.squad_number ?? null,
          language_belts: languageBelts,
          total_belts_earned: totalBelts(languageBelts),
          change: totalBelts(languageBelts) - totalBelts(previousLanguageBelts),
        };
        const searchableText = [
          entry.student_name,
          entry.university_name,
          entry.squad_number,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return { entry, searchableText };
      })
      .filter(
        ({ entry, searchableText }) =>
          (!universityId || entry.university_id === universityId) &&
          (!search || searchableText.includes(search)),
      )
      .map(({ entry }) => entry)
      .sort((left, right) => {
        if (right.total_belts_earned !== left.total_belts_earned) {
          return right.total_belts_earned - left.total_belts_earned;
        }

        return (left.student_name ?? "").localeCompare(
          right.student_name ?? "",
        );
      });

    const rankedEntries = filteredEntries.map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));
    const leaderboard = rankedEntries;

    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error("Overall leaderboard GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
