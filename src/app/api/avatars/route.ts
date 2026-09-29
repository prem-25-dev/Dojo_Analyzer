import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createRequestSupabaseClient } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/server";

type AvatarMaps = {
  byEmail: Record<string, string>;
  byStudentId: Record<string, string>;
};

// Google photos change rarely; rebuild the map at most every 10 minutes.
const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; maps: AvatarMaps } | null = null;

function googlePhoto(meta: Record<string, unknown> | undefined) {
  const url = meta?.avatar_url ?? meta?.picture;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

async function buildMaps(): Promise<AvatarMaps> {
  const byEmail: Record<string, string> = {};
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    for (const user of data.users) {
      const photo = googlePhoto(user.user_metadata);
      if (user.email && photo) byEmail[user.email.toLowerCase()] = photo;
    }
    if (data.users.length < 1000) break;
  }

  // PostgREST caps each response at 1000 rows, so page through students.
  const byStudentId: Record<string, string> = {};
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("students")
      .select("id, email")
      .range(from, from + 999);
    if (error) throw error;
    for (const student of data ?? []) {
      const photo = student.email
        ? byEmail[String(student.email).toLowerCase()]
        : undefined;
      if (photo) byStudentId[student.id] = photo;
    }
    if (!data || data.length < 1000) break;
  }
  return { byEmail, byStudentId };
}

/**
 * Google profile photos for everyone who has signed in with Google, keyed by
 * student id (and, for staff, by email). People who never signed in are
 * absent and fall back to initials.
 */
export async function GET() {
  try {
    const supabase = await createRequestSupabaseClient();
    const current = await getCurrentUserProfile(supabase);
    if (current.status !== "authenticated")
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!cache || Date.now() - cache.at > TTL_MS)
      cache = { at: Date.now(), maps: await buildMaps() };

    const isStaff = current.profile.role !== "student";
    return NextResponse.json(
      {
        byStudentId: cache.maps.byStudentId,
        byEmail: isStaff ? cache.maps.byEmail : {},
      },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    console.error("Avatars GET error:", error);
    return NextResponse.json({ byStudentId: {}, byEmail: {} });
  }
}
