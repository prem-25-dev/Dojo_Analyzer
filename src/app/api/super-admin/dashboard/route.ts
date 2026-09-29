import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/authorization";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const authorization = await requireSuperAdmin();
  if (authorization.response) return authorization.response;
  try {
    const [
      universities,
      students,
      squads,
      managers,
      mentors,
      latestImport,
      activity,
      profiles,
    ] = await Promise.all([
      supabaseAdmin
        .from("universities")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("students")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin.from("squads").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "campus_manager"),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "mentor"),
      supabaseAdmin
        .from("imports")
        .select(
          "id, file_name, uploaded_at, weeks!inner(academic_year, week_number)",
        )
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("audit_logs")
        .select("actor_user_id, action, target_type, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin.from("profiles").select("id, full_name"),
    ]);
    for (const result of [
      universities,
      students,
      squads,
      managers,
      mentors,
      latestImport,
      activity,
      profiles,
    ])
      if (result.error) throw result.error;

    const { data: beltRecords, error: beltError } = await supabaseAdmin
      .from("weekly_belt_records")
      .select("final_belt_levels, imports!inner(is_current, status)")
      .eq("imports.is_current", true)
      .eq("imports.status", "imported");
    if (beltError) throw beltError;
    const distribution = { cpp: 0, java: 0, nodejs: 0, python: 0 };
    for (const record of beltRecords ?? []) {
      const values = record.final_belt_levels as Record<string, unknown> | null;
      for (const language of Object.keys(distribution) as Array<
        keyof typeof distribution
      >) {
        const level = Number(values?.[language]);
        if (Number.isFinite(level)) distribution[language] += level;
      }
    }
    const actorNames = new Map(
      (profiles.data ?? []).map((profile) => [profile.id, profile.full_name]),
    );
    return NextResponse.json({
      totals: {
        universities: universities.count ?? 0,
        students: students.count ?? 0,
        squads: squads.count ?? 0,
        campus_managers: managers.count ?? 0,
        mentors: mentors.count ?? 0,
      },
      latestImport: latestImport.data
        ? {
            file_name: latestImport.data.file_name,
            uploaded_at: latestImport.data.uploaded_at,
            week: Array.isArray(latestImport.data.weeks)
              ? latestImport.data.weeks[0]
              : latestImport.data.weeks,
          }
        : null,
      distribution,
      recentActivity: (activity.data ?? []).map((entry) => ({
        actor: entry.actor_user_id
          ? (actorNames.get(entry.actor_user_id) ?? "Administrator")
          : "System",
        action: entry.action,
        target_type: entry.target_type,
        created_at: entry.created_at,
      })),
    });
  } catch (error) {
    console.error("Super Admin dashboard error:", error);
    return NextResponse.json(
      { error: "Unable to load global overview" },
      { status: 500 },
    );
  }
}
