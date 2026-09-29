import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createRequestSupabaseClient } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { LANGUAGES, type DashboardData } from "@/lib/dashboard/metrics";

// PostgREST caps responses (1000 rows by default), so every list is paged.
const PAGE_SIZE = 1000;

async function fetchAll<T>(
  build: () => {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
  },
) {
  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await build().range(
      page * PAGE_SIZE,
      (page + 1) * PAGE_SIZE - 1,
    );
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}

function nested<T>(value: T | T[] | null | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function levelsOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const levels: number[] = [];
  for (const language of LANGUAGES) {
    const level = Number(record[language] ?? 0);
    if (!Number.isFinite(level) || level < 0) return null;
    levels.push(level);
  }
  return levels;
}

type WeekRow = {
  id: string;
  university_id: string;
  academic_year: number;
  week_number: number;
  start_date: string | null;
  end_date: string | null;
  imports: Array<{ status: string; is_current: boolean }> | null;
};

type MembershipRow = {
  student_id: string;
  squad_id: string;
  start_date: string | null;
  students: { name: string | null } | Array<{ name: string | null }> | null;
  squads: { university_id: string } | Array<{ university_id: string }> | null;
};

type RecordRow = {
  student_id: string;
  week_id: string;
  final_belt_levels: unknown;
};

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
        { error: "Dashboard access is not authorized" },
        { status: 403 },
      );
    }

    const { role, university_id: ownUniversityId } = currentUser.profile;
    const isSuperAdmin = role === "super_admin";
    if (!isSuperAdmin && role !== "campus_manager" && role !== "mentor") {
      return NextResponse.json(
        { error: "Dashboard access is not authorized" },
        { status: 403 },
      );
    }
    if (!isSuperAdmin && !ownUniversityId) {
      return NextResponse.json(
        { error: "Account is not assigned to a university" },
        { status: 403 },
      );
    }

    const searchParams = new URL(request.url).searchParams;
    const requestedUniversity =
      searchParams.get("university_id")?.trim() || null;
    if (
      !isSuperAdmin &&
      requestedUniversity &&
      requestedUniversity !== ownUniversityId
    ) {
      return NextResponse.json(
        { error: "University access is not authorized" },
        { status: 403 },
      );
    }
    const universityId = isSuperAdmin ? requestedUniversity : ownUniversityId;

    // Universities in scope
    let universitiesQuery = supabaseAdmin
      .from("universities")
      .select("id, name")
      .order("name");
    if (!isSuperAdmin && universityId)
      universitiesQuery = universitiesQuery.eq("id", universityId);
    const { data: universities, error: universitiesError } =
      await universitiesQuery;
    if (universitiesError) throw universitiesError;

    // Weeks that have a current, fully imported file
    const allWeeks = await fetchAll<WeekRow>(() => {
      let query = supabaseAdmin
        .from("weeks")
        .select(
          "id, university_id, academic_year, week_number, start_date, end_date, imports(status, is_current)",
        )
        .order("academic_year")
        .order("week_number");
      if (universityId) query = query.eq("university_id", universityId);
      return query;
    });
    const importedWeeks = allWeeks.filter((week) =>
      week.imports?.some(
        (version) => version.status === "imported" && version.is_current,
      ),
    );
    const academicYears = [
      ...new Set(importedWeeks.map((week) => week.academic_year)),
    ].sort((a, b) => b - a);
    const requestedYear = Number(searchParams.get("academic_year"));
    const academicYear = academicYears.includes(requestedYear)
      ? requestedYear
      : (academicYears[0] ?? null);
    const weeks = importedWeeks.filter(
      (week) => week.academic_year === academicYear,
    );
    const weekIds = new Set(weeks.map((week) => week.id));

    // Squads and active students
    const squads = await fetchAll<{
      id: string;
      squad_number: string;
      university_id: string;
    }>(() => {
      let query = supabaseAdmin
        .from("squads")
        .select("id, squad_number, university_id")
        .order("squad_number");
      if (universityId) query = query.eq("university_id", universityId);
      return query;
    });

    const memberships = await fetchAll<MembershipRow>(() => {
      let query = supabaseAdmin
        .from("student_memberships")
        .select(
          "student_id, squad_id, start_date, students!inner(name), squads!inner(university_id)",
        )
        .is("end_date", null)
        .order("start_date", { ascending: false });
      if (universityId) query = query.eq("squads.university_id", universityId);
      return query;
    });
    const students = new Map<
      string,
      { id: string; name: string; squad_id: string }
    >();
    for (const membership of memberships) {
      if (students.has(membership.student_id)) continue;
      students.set(membership.student_id, {
        id: membership.student_id,
        name: nested(membership.students)?.name ?? "Unnamed student",
        squad_id: membership.squad_id,
      });
    }

    // Belt records from current imports only
    const records: DashboardData["records"] = [];
    if (weekIds.size > 0) {
      const rows = await fetchAll<RecordRow>(() =>
        supabaseAdmin
          .from("weekly_belt_records")
          .select(
            "student_id, week_id, final_belt_levels, imports!inner(is_current, status)",
          )
          .in("week_id", [...weekIds])
          .eq("imports.is_current", true)
          .eq("imports.status", "imported")
          .order("week_id")
          .order("student_id"),
      );
      const seen = new Set<string>();
      for (const row of rows) {
        const key = `${row.student_id}:${row.week_id}`;
        const levels = levelsOf(row.final_belt_levels);
        if (seen.has(key) || !levels || !students.has(row.student_id)) continue;
        seen.add(key);
        records.push({ s: row.student_id, w: row.week_id, l: levels });
      }
    }

    // Data freshness
    let latestImportQuery = supabaseAdmin
      .from("imports")
      .select("file_name, uploaded_at, weeks!inner(week_number, university_id)")
      .eq("status", "imported")
      .order("uploaded_at", { ascending: false })
      .limit(1);
    if (universityId)
      latestImportQuery = latestImportQuery.eq(
        "weeks.university_id",
        universityId,
      );
    const { data: latestImports, error: latestImportError } =
      await latestImportQuery;
    if (latestImportError) throw latestImportError;
    const latest = latestImports?.[0];
    const latestWeek = nested(
      latest?.weeks as
        { week_number: number } | Array<{ week_number: number }> | null,
    );

    const body: DashboardData = {
      role,
      universityId,
      universities: universities ?? [],
      academicYears,
      academicYear,
      weeks: weeks.map((week) => ({
        id: week.id,
        university_id: week.university_id,
        week_number: week.week_number,
        start_date: week.start_date,
        end_date: week.end_date,
      })),
      squads,
      students: [...students.values()],
      records,
      latestImport: latest
        ? {
            file_name: latest.file_name,
            uploaded_at: latest.uploaded_at,
            week_number: latestWeek?.week_number ?? null,
          }
        : null,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Dashboard overview error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load dashboard",
      },
      { status: 500 },
    );
  }
}
