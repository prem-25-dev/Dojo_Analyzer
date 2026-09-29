import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { writeAuditLog } from "@/lib/auth/authorization";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return redirectToLogin(requestUrl.origin);
  }

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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectToLogin(requestUrl.origin);
  }

  let currentUser = await getCurrentUserProfile(supabase);
  if (currentUser.status === "unassigned" && currentUser.user.email) {
    const email = currentUser.user.email.trim().toLowerCase();
    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from("user_invitations")
      .select("email, full_name, role, university_id, student_id, created_by")
      .eq("email", email)
      .maybeSingle();

    if (invitationError) return redirectToLogin(requestUrl.origin);
    if (invitation) {
      const { error: assignmentError } = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            id: currentUser.user.id,
            full_name: invitation.full_name,
            role: invitation.role,
            university_id: invitation.university_id,
            student_id: invitation.student_id,
          },
          { onConflict: "id" },
        );

      if (assignmentError) return redirectToLogin(requestUrl.origin);
      await supabaseAdmin.from("user_invitations").delete().eq("email", email);
      if (invitation.created_by) {
        await writeAuditLog(
          invitation.created_by,
          "user_assignment_completed",
          "profile",
          currentUser.user.id,
          { email, role: invitation.role },
        );
      }
      currentUser = await getCurrentUserProfile(supabase);
    }
  }
  const destination =
    currentUser.status === "authenticated" &&
    currentUser.profile.role === "student"
      ? "/leaderboard"
      : "/";

  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}

function redirectToLogin(origin: string) {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set(
    "error",
    "Authentication failed. Please try again.",
  );

  return NextResponse.redirect(loginUrl);
}
