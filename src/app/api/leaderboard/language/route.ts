import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createRequestSupabaseClient } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const SUPPORTED_LANGUAGES = ["cpp", "java", "nodejs", "python"] as const;
type Language = (typeof SUPPORTED_LANGUAGES)[number];

type MembershipRow = {
  student_id: string;
  students:
    | { id: string; name: string | null }
    | Array<{ id: string; name: string | null }>
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
  start_date: string;
  end_date: string;
};

type BeltRecord = {
  student_id: string;
  week_id: string;
  final_belt_levels: Record<string, unknown> | null;
};

function getNestedValue<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function getLevel(value: unknown) {
  const level = Number(value);
  return Number.isFinite(level) ? level : 0;
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

    const isSuperAdmin = currentUser.profile.role === "super_admin";
    if (
      (!isSuperAdmin &&
        currentUser.profile.role !== "campus_manager" &&
        currentUser.profile.role !== "mentor") ||
      (!isSuperAdmin && !currentUser.profile.university_id)
    ) {
      return NextResponse.json(
        { error: "Leaderboard access is not authorized" },
        { status: 403 },
      );
    }

    const authenticatedUniversityId = currentUser.profile.university_id;

    const searchParams = new URL(request.url).searchParams;
    const languageValue = searchParams.get("language")?.trim().toLowerCase();
    const weekId = searchParams.get("week_id")?.trim() || null;
    const universityId = searchParams.get("university_id")?.trim() || null;
    const search = searchParams.get("search")?.trim().toLowerCase() || "";

    if (
      !isSuperAdmin &&
      universityId &&
      universityId !== authenticatedUniversityId
    ) {
      return NextResponse.json(
        { error: "University access is not authorized" },
        { status: 403 },
      );
    }

    if (
      !languageValue ||
      !SUPPORTED_LANGUAGES.includes(languageValue as Language)
    ) {
      return NextResponse.json(
        { error: "language must be one of: cpp, java, nodejs, python" },
        { status: 400 },
      );
    }

    const language = languageValue as Language;
    let membershipQuery = supabaseAdmin
      .from("student_memberships")
      .select(
        "student_id, students!inner(id, name), squads!inner(squad_number, university_id)",
      )
      .is("end_date", null)
      .order("start_date", { ascending: false });
    let weekQuery = supabaseAdmin
      .from("weeks")
      .select(
        "id, university_id, academic_year, week_number, start_date, end_date, imports!inner(is_current, status)",
      )
      .eq("imports.is_current", true)
      .eq("imports.status", "imported");
    if (!isSuperAdmin) {
      membershipQuery = membershipQuery.eq(
        "squads.university_id",
        authenticatedUniversityId!,
      );
      weekQuery = weekQuery.eq("university_id", authenticatedUniversityId!);
    } else if (universityId) {
      membershipQuery = membershipQuery.eq(
        "squads.university_id",
        universityId,
      );
      weekQuery = weekQuery.eq("university_id", universityId);
    }
    const [membershipResult, weekResult] = await Promise.all([
      membershipQuery,
      weekQuery,
    ]);

    if (membershipResult.error) {
      throw membershipResult.error;
    }

    if (weekResult.error) {
      throw weekResult.error;
    }

    const membershipsByStudent = new Map<string, MembershipRow>();
    for (const membership of (membershipResult.data ?? []) as MembershipRow[]) {
      if (!membershipsByStudent.has(membership.student_id)) {
        membershipsByStudent.set(membership.student_id, membership);
      }
    }

    const memberships = Array.from(membershipsByStudent.values());
    const weeks = (weekResult.data ?? []) as WeekRow[];
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
        ? weekId && !(isSuperAdmin && !universityId)
          ? [selectedWeek.id]
          : weeks
              .filter((week) => samePeriod(week, selectedWeek))
              .map((week) => week.id)
        : [],
    );
    const previousWeekIds = new Set(
      previousWeek
        ? weekId && !(isSuperAdmin && !universityId)
          ? [previousWeek.id]
          : weeks
              .filter((week) => samePeriod(week, previousWeek))
              .map((week) => week.id)
        : [],
    );
    const recordWeekIds = [
      ...new Set([...selectedWeekIds, ...previousWeekIds]),
    ];
    const studentIds = memberships.map((membership) => membership.student_id);
    const universityIds = [
      ...new Set(
        memberships
          .map((membership) => getNestedValue(membership.squads)?.university_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [universitiesResult, recordsResult] = await Promise.all([
      universityIds.length > 0
        ? supabaseAdmin
            .from("universities")
            .select("id, name")
            .in("id", universityIds)
        : Promise.resolve({ data: [], error: null }),
      studentIds.length > 0 && recordWeekIds.length > 0
        ? supabaseAdmin
            .from("weekly_belt_records")
            .select(
              "student_id, week_id, final_belt_levels, imports!inner(is_current)",
            )
            .in("student_id", studentIds)
            .in("week_id", recordWeekIds)
            .eq("imports.is_current", true)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (universitiesResult.error) {
      throw universitiesResult.error;
    }

    if (recordsResult.error) {
      throw recordsResult.error;
    }

    const universityNames = new Map(
      (universitiesResult.data ?? []).map((university) => [
        university.id,
        university.name,
      ]),
    );
    const recordsByStudentWeek = new Map<string, BeltRecord>();

    for (const record of (recordsResult.data ?? []) as BeltRecord[]) {
      const key = `${record.student_id}:${record.week_id}`;
      if (!recordsByStudentWeek.has(key)) {
        recordsByStudentWeek.set(key, record);
      }
    }

    const selectedScores = new Map<string, number>();
    const previousScores = new Map<string, number>();

    for (const record of recordsByStudentWeek.values()) {
      const scores = selectedWeekIds.has(record.week_id)
        ? selectedScores
        : previousScores;
      scores.set(
        record.student_id,
        (scores.get(record.student_id) ?? 0) +
          getLevel(record.final_belt_levels?.[language]),
      );
    }

    const filteredEntries = memberships
      .map((membership) => {
        const student = getNestedValue(membership.students);
        const squad = getNestedValue(membership.squads);
        const entryUniversityId = squad?.university_id ?? null;
        const entry = {
          student_id: student?.id ?? membership.student_id,
          student_name: student?.name ?? null,
          university_id: entryUniversityId,
          university_name: entryUniversityId
            ? (universityNames.get(entryUniversityId) ?? null)
            : null,
          squad_number: squad?.squad_number ?? null,
          belt_level: selectedScores.get(membership.student_id) ?? 0,
          change:
            (selectedScores.get(membership.student_id) ?? 0) -
            (previousScores.get(membership.student_id) ?? 0),
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
        if (right.belt_level !== left.belt_level) {
          return right.belt_level - left.belt_level;
        }

        return (left.student_name ?? "").localeCompare(
          right.student_name ?? "",
        );
      });

    const leaderboard = filteredEntries.map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));

    return NextResponse.json({
      language,
      week: selectedWeek
        ? {
            id: selectedWeek.id,
            week_number: selectedWeek.week_number,
            academic_year: selectedWeek.academic_year,
          }
        : null,
      leaderboard,
    });
  } catch (error) {
    console.error("Language leaderboard GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
