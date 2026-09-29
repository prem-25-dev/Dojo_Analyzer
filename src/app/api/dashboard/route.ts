import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      },
    );

    const currentUser = await getCurrentUserProfile(supabase);

    if (currentUser.status === "unauthenticated") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (currentUser.status !== "authenticated") {
      return NextResponse.json(
        { error: "Account is not assigned to a university" },
        { status: 403 },
      );
    }

    if (
      currentUser.profile.role !== "campus_manager" &&
      currentUser.profile.role !== "mentor"
    ) {
      return NextResponse.json(
        { error: "Dashboard access is not authorized" },
        { status: 403 },
      );
    }

    const universityId = currentUser.profile.university_id;

    if (!universityId) {
      return NextResponse.json(
        { error: "Account is not assigned to a university" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);

    const academicYear = Number(
      searchParams.get("academicYear") ?? "2026"
    );

    const weekNumber = Number(
      searchParams.get("weekNumber") ?? "1"
    );

    if (!Number.isInteger(academicYear) || academicYear < 2000) {
      return NextResponse.json(
        { error: "Invalid academic year" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(weekNumber) || weekNumber < 1) {
      return NextResponse.json(
        { error: "Invalid week number" },
        { status: 400 }
      );
    }

    const [summaryResult, studentsResult] = await Promise.all([
      supabaseAdmin.rpc("get_dashboard_summary", {
        p_academic_year: academicYear,
        p_week_number: weekNumber,
        p_university_id: universityId,
      }),

      supabaseAdmin.rpc("get_dashboard_week", {
        p_academic_year: academicYear,
        p_week_number: weekNumber,
        p_university_id: universityId,
      }),
    ]);

    if (summaryResult.error) {
      throw summaryResult.error;
    }

    if (studentsResult.error) {
      throw studentsResult.error;
    }

    return NextResponse.json({
      academicYear,
      weekNumber,
      summary: summaryResult.data?.[0] ?? null,
      students: studentsResult.data ?? [],
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error",
      },
      { status: 500 }
    );
  }
}