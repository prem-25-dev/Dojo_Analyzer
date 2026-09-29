import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createRequestSupabaseClient } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const LANGUAGES = ["cpp", "java", "nodejs", "python"] as const;
type Language = (typeof LANGUAGES)[number];
const STATUSES = ["all", "improved", "no_change", "missing_data"] as const;
type ComparisonStatus = (typeof STATUSES)[number];

type Week = {
  id: string;
  week_number: number;
  academic_year: number;
  university_id: string;
  start_date: string;
  end_date: string;
};

type Membership = {
  student_id: string;
  start_date: string | null;
  students:
    | { id: string; name: string | null; email: string | null }
    | Array<{ id: string; name: string | null; email: string | null }>
    | null;
  squads:
    | { id: string; squad_number: string; university_id: string }
    | Array<{ id: string; squad_number: string; university_id: string }>
    | null;
};

type BeltRecord = {
  student_id: string;
  week_id: string;
  final_belt_levels: Record<string, unknown> | null;
};

type LanguageComparison = Record<
  Language,
  { from: number | null; to: number | null }
>;

function nested<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function level(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyLanguages(): LanguageComparison {
  return {
    cpp: { from: 0, to: 0 },
    java: { from: 0, to: 0 },
    nodejs: { from: 0, to: 0 },
    python: { from: 0, to: 0 },
  };
}

function recordLanguages(record: BeltRecord | undefined) {
  if (
    !record ||
    !record.final_belt_levels ||
    typeof record.final_belt_levels !== "object" ||
    Array.isArray(record.final_belt_levels)
  ) {
    return null;
  }

  return LANGUAGES.reduce(
    (result, language) => {
      result[language] = level(record.final_belt_levels?.[language]);
      return result;
    },
    {} as Record<Language, number>,
  );
}

function total(values: Record<Language, number> | null) {
  return values
    ? LANGUAGES.reduce((sum, language) => sum + values[language], 0)
    : null;
}

function isStatus(value: string): value is ComparisonStatus {
  return STATUSES.includes(value as ComparisonStatus);
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
        { error: "Weekly comparison access is not authorized" },
        { status: 403 },
      );
    }

    const authenticatedUniversityId = currentUser.profile.university_id;

    const searchParams = new URL(request.url).searchParams;
    const fromWeekId = searchParams.get("from_week_id")?.trim();
    const toWeekId = searchParams.get("to_week_id")?.trim();
    const universityId = searchParams.get("university_id")?.trim() || null;
    const squadId = searchParams.get("squad_id")?.trim() || null;
    const requestedStatus =
      searchParams.get("status")?.trim().toLowerCase() || "all";
    const search = searchParams.get("search")?.trim().toLowerCase() || "";

    if (!fromWeekId || !toWeekId) {
      return NextResponse.json(
        { error: "from_week_id and to_week_id are required" },
        { status: 400 },
      );
    }

    if (!isStatus(requestedStatus)) {
      return NextResponse.json(
        { error: "Invalid status filter" },
        { status: 400 },
      );
    }

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

    if (squadId) {
      let squadQuery = supabaseAdmin
        .from("squads")
        .select("id")
        .eq("id", squadId);
      if (!isSuperAdmin || universityId)
        squadQuery = squadQuery.eq(
          "university_id",
          universityId ?? authenticatedUniversityId!,
        );
      const { data: squad, error: squadError } = await squadQuery.maybeSingle();

      if (squadError) throw squadError;
      if (!squad)
        return NextResponse.json(
          { error: "Squad access is not authorized" },
          { status: 403 },
        );
    }

    let weeksQuery = supabaseAdmin
      .from("weeks")
      .select(
        "id, week_number, academic_year, university_id, start_date, end_date, imports!inner(is_current)",
      )
      .in("id", [fromWeekId, toWeekId])
      .eq("imports.is_current", true);
    let membershipsQuery = supabaseAdmin
      .from("student_memberships")
      .select(
        "student_id, start_date, students!inner(id, name, email), squads!inner(id, squad_number, university_id)",
      )
      .is("end_date", null)
      .order("start_date", { ascending: false });
    let recordsQuery = supabaseAdmin
      .from("weekly_belt_records")
      .select(
        "student_id, week_id, final_belt_levels, weeks!inner(university_id), imports!inner(is_current)",
      )
      .in("week_id", [fromWeekId, toWeekId])
      .eq("imports.is_current", true);
    if (!isSuperAdmin) {
      weeksQuery = weeksQuery.eq("university_id", authenticatedUniversityId!);
      membershipsQuery = membershipsQuery.eq(
        squadId ? "squads.id" : "squads.university_id",
        squadId ?? authenticatedUniversityId!,
      );
      recordsQuery = recordsQuery.eq(
        "weeks.university_id",
        authenticatedUniversityId!,
      );
    } else {
      if (universityId) {
        weeksQuery = weeksQuery.eq("university_id", universityId);
        membershipsQuery = membershipsQuery.eq(
          "squads.university_id",
          universityId,
        );
        recordsQuery = recordsQuery.eq("weeks.university_id", universityId);
      }
      if (squadId) membershipsQuery = membershipsQuery.eq("squads.id", squadId);
    }
    const [weeksResult, membershipsResult, recordsResult] = await Promise.all([
      weeksQuery,
      membershipsQuery,
      recordsQuery,
    ]);

    if (weeksResult.error) throw weeksResult.error;
    if (membershipsResult.error) throw membershipsResult.error;
    if (recordsResult.error) throw recordsResult.error;

    let comparisonWeeks = (weeksResult.data ?? []) as Week[];
    let comparisonRecords = recordsResult.data ?? [];
    if (isSuperAdmin && !universityId) {
      const { data: allWeeks, error: allWeeksError } = await supabaseAdmin
        .from("weeks")
        .select(
          "id, week_number, academic_year, university_id, start_date, end_date, imports!inner(is_current)",
        )
        .eq("imports.is_current", true);
      if (allWeeksError) throw allWeeksError;
      const requestedFrom = comparisonWeeks.find(
        (week) => week.id === fromWeekId,
      );
      const requestedTo = comparisonWeeks.find((week) => week.id === toWeekId);
      if (!requestedFrom || !requestedTo) {
        return NextResponse.json(
          { error: "One or both weeks were not found or are not current" },
          { status: 404 },
        );
      }
      comparisonWeeks = (allWeeks ?? []).filter(
        (week) =>
          (week.academic_year === requestedFrom.academic_year &&
            week.week_number === requestedFrom.week_number) ||
          (week.academic_year === requestedTo.academic_year &&
            week.week_number === requestedTo.week_number),
      ) as Week[];
      const periodWeekIds = comparisonWeeks.map((week) => week.id);
      const { data: periodRecords, error: periodRecordsError } =
        periodWeekIds.length
          ? await supabaseAdmin
              .from("weekly_belt_records")
              .select(
                "student_id, week_id, final_belt_levels, weeks!inner(university_id), imports!inner(is_current)",
              )
              .in("week_id", periodWeekIds)
              .eq("imports.is_current", true)
          : { data: [], error: null };
      if (periodRecordsError) throw periodRecordsError;
      comparisonRecords = periodRecords ?? [];
    }

    const weekById = new Map(comparisonWeeks.map((week) => [week.id, week]));
    const fromWeek = weekById.get(fromWeekId);
    const toWeek = weekById.get(toWeekId);

    if (!fromWeek || !toWeek) {
      return NextResponse.json(
        { error: "One or both weeks were not found or are not current" },
        { status: 404 },
      );
    }

    const currentMembershipByStudent = new Map<string, Membership>();
    for (const membership of (membershipsResult.data ?? []) as Membership[]) {
      if (!currentMembershipByStudent.has(membership.student_id)) {
        currentMembershipByStudent.set(membership.student_id, membership);
      }
    }

    const recordsByStudentWeek = new Map<string, BeltRecord>();
    for (const record of comparisonRecords as BeltRecord[]) {
      const key = `${record.student_id}:${record.week_id}`;
      if (!recordsByStudentWeek.has(key)) recordsByStudentWeek.set(key, record);
    }

    const studentIds = new Set<string>(
      (recordsResult.data ?? []).map(
        (record) => (record as BeltRecord).student_id,
      ),
    );
    const universityIds = [
      ...new Set(
        Array.from(currentMembershipByStudent.values())
          .map((membership) => nested(membership.squads)?.university_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const { data: universities, error: universitiesError } =
      universityIds.length
        ? await supabaseAdmin
            .from("universities")
            .select("id, name")
            .in("id", universityIds)
        : { data: [], error: null };

    if (universitiesError) throw universitiesError;

    const universityNames = new Map(
      (universities ?? []).map((university) => [
        university.id,
        university.name,
      ]),
    );
    const allComparisons = Array.from(studentIds)
      .map((studentId) => {
        const membership = currentMembershipByStudent.get(studentId);
        if (!membership) return null;

        const student = nested(membership.students);
        const squad = nested(membership.squads);
        const fromRecord = recordsByStudentWeek.get(
          `${studentId}:${fromWeekId}`,
        );
        const toRecord = recordsByStudentWeek.get(`${studentId}:${toWeekId}`);
        const fromLanguages = recordLanguages(fromRecord);
        const toLanguages = recordLanguages(toRecord);
        const fromInvalid = Boolean(fromRecord && !fromLanguages);
        const toInvalid = Boolean(toRecord && !toLanguages);
        const languages = emptyLanguages();

        for (const language of LANGUAGES) {
          languages[language] = {
            from: fromRecord ? (fromLanguages?.[language] ?? null) : 0,
            to: toRecord ? (toLanguages?.[language] ?? null) : null,
          };
        }

        const fromTotal = fromRecord
          ? fromInvalid
            ? null
            : total(fromLanguages)
          : 0;
        const toTotal = toRecord
          ? toInvalid
            ? null
            : total(toLanguages)
          : null;
        const netChange =
          fromTotal !== null && toTotal !== null ? toTotal - fromTotal : null;
        const status: Exclude<ComparisonStatus, "all"> =
          !fromRecord && !toRecord
            ? "missing_data"
            : toRecord && !toLanguages
              ? "missing_data"
              : !toRecord ||
                  fromInvalid ||
                  toInvalid ||
                  netChange === null ||
                  netChange < 0
                ? "missing_data"
                : netChange > 0
                  ? "improved"
                  : "no_change";

        if (!fromRecord && !toRecord) {
          return null;
        }

        return {
          student_id: student?.id ?? studentId,
          student_name: student?.name ?? null,
          email: student?.email ?? null,
          university_id: squad?.university_id ?? null,
          university_name: squad?.university_id
            ? (universityNames.get(squad.university_id) ?? null)
            : null,
          squad_id: squad?.id ?? null,
          squad_number: squad?.squad_number ?? null,
          from_total: fromTotal,
          to_total: toTotal,
          net_change: netChange,
          status,
          languages,
        };
      })
      .filter((comparison): comparison is NonNullable<typeof comparison> =>
        Boolean(comparison),
      )
      .filter((comparison) => {
        const searchableText = [
          comparison.student_name,
          comparison.email,
          comparison.university_name,
          comparison.squad_number,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          (!universityId || comparison.university_id === universityId) &&
          (!squadId || comparison.squad_id === squadId) &&
          (!search || searchableText.includes(search))
        );
      });

    const comparisons = allComparisons
      .filter(
        (comparison) =>
          requestedStatus === "all" || comparison.status === requestedStatus,
      )
      .sort((left, right) => {
        if (left.net_change === null && right.net_change !== null) return 1;
        if (left.net_change !== null && right.net_change === null) return -1;
        if (
          left.net_change !== null &&
          right.net_change !== null &&
          right.net_change !== left.net_change
        ) {
          return right.net_change - left.net_change;
        }
        return (left.student_name ?? "").localeCompare(
          right.student_name ?? "",
        );
      });

    const summary = {
      total: comparisons.length,
      improved: comparisons.filter(
        (comparison) => comparison.status === "improved",
      ).length,
      no_change: comparisons.filter(
        (comparison) => comparison.status === "no_change",
      ).length,
      missing_data: comparisons.filter(
        (comparison) => comparison.status === "missing_data",
      ).length,
    };

    return NextResponse.json({
      from_week: {
        id: fromWeek.id,
        week_number: fromWeek.week_number,
        academic_year: fromWeek.academic_year,
      },
      to_week: {
        id: toWeek.id,
        week_number: toWeek.week_number,
        academic_year: toWeek.academic_year,
      },
      summary,
      comparisons,
    });
  } catch (error) {
    console.error("Weekly comparison GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
