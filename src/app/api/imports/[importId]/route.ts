import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { supabaseAdmin } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ importId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
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
        { error: "Import detail access is not authorized" },
        { status: 403 },
      );
    }

    const { importId } = await context.params;
    let importQuery = supabaseAdmin
      .from("imports")
      .select(
        "id, week_id, file_name, uploaded_at, status, row_count, is_current, weeks!inner(week_number, academic_year, university_id)",
      )
      .eq("id", importId);
    if (currentUser.profile.role === "campus_manager")
      importQuery = importQuery.eq(
        "weeks.university_id",
        currentUser.profile.university_id!,
      );
    const { data: importData, error: importError } =
      await importQuery.maybeSingle();

    if (importError) {
      throw importError;
    }

    if (!importData) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    const week = Array.isArray(importData.weeks)
      ? importData.weeks[0]
      : importData.weeks;

    const [errorsResult, rawRowsResult] = await Promise.all([
      supabaseAdmin
        .from("import_errors")
        .select(
          "id, row_number, field_name, error_message, raw_value, created_at",
        )
        .eq("import_id", importId)
        .order("row_number", { ascending: true }),
      supabaseAdmin
        .from("raw_import_rows")
        .select("id, row_number, source_record_id, raw_data, created_at")
        .eq("import_id", importId)
        .order("row_number", { ascending: true }),
    ]);

    if (errorsResult.error) {
      throw errorsResult.error;
    }

    if (rawRowsResult.error) {
      throw rawRowsResult.error;
    }

    return NextResponse.json({
      import: {
        id: importData.id,
        week_id: importData.week_id,
        file_name: importData.file_name,
        uploaded_at: importData.uploaded_at,
        status: importData.status,
        row_count: importData.row_count,
        is_current: importData.is_current,
        week_number: week?.week_number ?? null,
        academic_year: week?.academic_year ?? null,
      },
      errors: errorsResult.data ?? [],
      rawRows: rawRowsResult.data ?? [],
    });
  } catch (error) {
    console.error("Import detail error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
