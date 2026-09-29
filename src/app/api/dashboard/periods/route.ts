import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createRequestSupabaseClient } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/server";

type ImportVersion = {
  status: string;
  is_current: boolean;
};

type WeekRow = {
  id: string;
  academic_year: number;
  week_number: number;
  start_date: string;
  end_date: string;
  imports: ImportVersion[] | null;
};

const PAGE_SIZE = 500;

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

    if (
      currentUser.status !== "authenticated" ||
      (currentUser.profile.role !== "super_admin" &&
        currentUser.profile.role !== "campus_manager" &&
        currentUser.profile.role !== "mentor") ||
      (currentUser.profile.role !== "super_admin" &&
        !currentUser.profile.university_id)
    ) {
      return NextResponse.json(
        { error: "Dashboard period access is not authorized" },
        { status: 403 },
      );
    }

    const requestedUniversityId =
      new URL(request.url).searchParams.get("university_id")?.trim() || null;
    if (
      currentUser.profile.role !== "super_admin" &&
      requestedUniversityId &&
      requestedUniversityId !== currentUser.profile.university_id
    ) {
      return NextResponse.json(
        { error: "University access is not authorized" },
        { status: 403 },
      );
    }
    const universityId =
      currentUser.profile.role === "super_admin"
        ? requestedUniversityId
        : currentUser.profile.university_id;
    const weeks: WeekRow[] = [];
    for (let page = 0; ; page += 1) {
      let query = supabaseAdmin
        .from("weeks")
        .select("id, academic_year, week_number, start_date, end_date, imports(status, is_current)")
        .order("academic_year", { ascending: true })
        .order("week_number", { ascending: true });
      if (universityId) query = query.eq("university_id", universityId);
      const { data, error } = await query.range(
        page * PAGE_SIZE,
        (page + 1) * PAGE_SIZE - 1,
      );

      if (error) throw error;
      weeks.push(...((data ?? []) as WeekRow[]));
      if ((data ?? []).length < PAGE_SIZE) break;
    }

    const academicYears = Array.from(
      new Set(weeks.map((week) => week.academic_year)),
    ).sort((a, b) => b - a);
    const availableWeeks = weeks
      .filter((week) =>
        week.imports?.some(
          (version) => version.status === "imported" && version.is_current,
        ),
      )
      .map((week) => ({
        week_id: week.id,
        academic_year: week.academic_year,
        week_number: week.week_number,
        start_date: week.start_date,
        end_date: week.end_date,
      }))
      .sort(
        (a, b) =>
          a.academic_year - b.academic_year || a.week_number - b.week_number,
      );

    return NextResponse.json({
      academicYears,
      weeks: availableWeeks,
      allWeeks: weeks.map((week) => ({
        week_id: week.id,
        academic_year: week.academic_year,
        week_number: week.week_number,
        start_date: week.start_date,
        end_date: week.end_date,
      })),
    });
  } catch (error) {
    console.error("Dashboard periods error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
