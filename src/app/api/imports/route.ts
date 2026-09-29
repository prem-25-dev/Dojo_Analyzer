import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { supabaseAdmin } from "@/lib/supabase/server";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    if (
      currentUser.status !== "authenticated" ||
      (currentUser.profile.role !== "campus_manager" &&
        currentUser.profile.role !== "super_admin") ||
      (currentUser.profile.role === "campus_manager" &&
        !currentUser.profile.university_id)
    ) {
      return NextResponse.json(
        { error: "Import history access is not authorized" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedUniversityId =
      searchParams.get("university_id")?.trim() || null;
    const universityId =
      currentUser.profile.role === "super_admin"
        ? requestedUniversityId
        : currentUser.profile.university_id;
    if (currentUser.profile.role === "super_admin" && !universityId) {
      return NextResponse.json(
        { error: "Select a university to view imports" },
        { status: 400 },
      );
    }
    const requestedPage = Number(searchParams.get("page") ?? DEFAULT_PAGE);
    const requestedLimit = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
    const page =
      Number.isInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : DEFAULT_PAGE;
    const limit =
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, MAX_LIMIT)
        : DEFAULT_LIMIT;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await supabaseAdmin
      .from("imports")
      .select(
        "id, week_id, file_name, uploaded_at, status, row_count, is_current, weeks!inner(week_number, academic_year, start_date, end_date, university_id)",
        { count: "exact" },
      )
      .eq("weeks.university_id", universityId!)
      .order("uploaded_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    const imports = (data ?? []).map((importRecord) => {
      const week = Array.isArray(importRecord.weeks)
        ? importRecord.weeks[0]
        : importRecord.weeks;

      return {
        id: importRecord.id,
        week_id: importRecord.week_id,
        file_name: importRecord.file_name,
        uploaded_at: importRecord.uploaded_at,
        status: importRecord.status,
        row_count: importRecord.row_count,
        is_current: importRecord.is_current,
        week_number: week?.week_number ?? null,
        academic_year: week?.academic_year ?? null,
        start_date: week?.start_date ?? null,
        end_date: week?.end_date ?? null,
      };
    });

    const total = count ?? 0;

    return NextResponse.json({
      imports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Import history error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
