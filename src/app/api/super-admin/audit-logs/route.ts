import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/authorization";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const authorization = await requireSuperAdmin();
  if (authorization.response) return authorization.response;
  try {
    const [logs, profiles] = await Promise.all([
      supabaseAdmin
        .from("audit_logs")
        .select("actor_user_id, action, target_type, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin.from("profiles").select("id, full_name"),
    ]);
    if (logs.error) throw logs.error;
    if (profiles.error) throw profiles.error;
    const names = new Map(
      (profiles.data ?? []).map((profile) => [profile.id, profile.full_name]),
    );
    return NextResponse.json({
      logs: (logs.data ?? []).map((log) => ({
        actor: log.actor_user_id
          ? (names.get(log.actor_user_id) ?? "Administrator")
          : "System",
        action: log.action,
        target_type: log.target_type,
        created_at: log.created_at,
        metadata: log.metadata,
      })),
    });
  } catch (error) {
    console.error("Super Admin audit logs error:", error);
    return NextResponse.json(
      { error: "Unable to load audit logs" },
      { status: 500 },
    );
  }
}
