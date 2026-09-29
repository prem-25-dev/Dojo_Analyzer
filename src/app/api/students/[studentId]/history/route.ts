import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createRequestSupabaseClient } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ studentId: string }>;
};

function isManagerOrMentor(role: string) {
  return role === "campus_manager" || role === "mentor";
}

export async function GET(_request: Request, context: RouteContext) {
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
      (!isManagerOrMentor(currentUser.profile.role) &&
        currentUser.profile.role !== "super_admin") ||
      (currentUser.profile.role !== "super_admin" &&
        !currentUser.profile.university_id)
    ) {
      return NextResponse.json(
        { error: "Student history access is not authorized" },
        { status: 403 },
      );
    }

    const { studentId } = await context.params;
    const universityId = currentUser.profile.university_id;
    let membershipsQuery = supabaseAdmin
      .from("student_memberships")
      .select(
        "student_id, start_date, end_date, students!inner(id, name, email), squads!inner(id, squad_number, university_id)",
      )
      .eq("student_id", studentId)
      .order("start_date", { ascending: true });
    if (universityId)
      membershipsQuery = membershipsQuery.eq(
        "squads.university_id",
        universityId,
      );
    const { data: memberships, error: membershipsError } =
      await membershipsQuery;

    if (membershipsError) {
      throw membershipsError;
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const firstMembership = memberships[0];
    const student = Array.isArray(firstMembership.students)
      ? firstMembership.students[0]
      : firstMembership.students;

    let recordsQuery = supabaseAdmin
      .from("weekly_belt_records")
      .select(
        "start_time, calculated_end_time, belt_test_updated_at, initial_belt_levels, final_belt_levels, weeks!inner(academic_year, week_number, university_id), imports!inner(is_current)",
      )
      .eq("student_id", studentId)
      .eq("imports.is_current", true)
      .order("academic_year", { ascending: true, referencedTable: "weeks" })
      .order("week_number", { ascending: true, referencedTable: "weeks" })
      .order("start_time", { ascending: true });
    if (universityId)
      recordsQuery = recordsQuery.eq("weeks.university_id", universityId);
    const { data: weeklyRecords, error: weeklyRecordsError } =
      await recordsQuery;

    if (weeklyRecordsError) {
      throw weeklyRecordsError;
    }

    return NextResponse.json({
      student: {
        id: student?.id ?? studentId,
        name: student?.name ?? null,
        email: student?.email ?? null,
      },
      memberships: memberships.map((membership) => {
        const squad = Array.isArray(membership.squads)
          ? membership.squads[0]
          : membership.squads;

        return {
          squad_number: squad?.squad_number ?? null,
          start_date: membership.start_date,
          end_date: membership.end_date,
        };
      }),
      weeklyRecords: (weeklyRecords ?? []).map((record) => {
        const week = Array.isArray(record.weeks)
          ? record.weeks[0]
          : record.weeks;

        return {
          academic_year: week?.academic_year ?? null,
          week_number: week?.week_number ?? null,
          start_time: record.start_time,
          calculated_end_time: record.calculated_end_time,
          belt_test_updated_at: record.belt_test_updated_at,
          initial_belt_levels: record.initial_belt_levels,
          final_belt_levels: record.final_belt_levels,
        };
      }),
    });
  } catch (error) {
    console.error("Student history GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
