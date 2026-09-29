import { createRequestSupabaseClient } from "@/lib/auth/server";
import { NextResponse } from "next/server";

/**
 * POST /auth/signout
 *
 * Signs out the current session (local scope — does not affect other devices).
 * Redirects to /login on success. Returns JSON error on failure.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;

  const supabase = await createRequestSupabaseClient();

  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    return NextResponse.json(
      { error: "Sign out failed. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.redirect(new URL("/login", origin), { status: 303 });
}
