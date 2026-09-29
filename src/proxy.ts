import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const currentUser = await getCurrentUserProfile(supabase);
  const pathname = request.nextUrl.pathname;
  if (
    currentUser.status === "authenticated" &&
    currentUser.profile.role === "student"
  ) {
    if (pathname !== "/leaderboard" && pathname !== "/profile") {
      const redirectResponse = NextResponse.redirect(
        new URL("/leaderboard", request.url),
      );
      response.cookies
        .getAll()
        .forEach((cookie) => redirectResponse.cookies.set(cookie));
      return redirectResponse;
    }
  }
  if (currentUser.status === "authenticated") {
    const role = currentUser.profile.role;
    const superAdminOnly =
      pathname === "/users" ||
      pathname.startsWith("/users/") ||
      pathname === "/universities" ||
      pathname.startsWith("/universities/") ||
      pathname === "/audit-logs" ||
      pathname.startsWith("/audit-logs/");
    const managerOnly =
      pathname === "/imports" || pathname.startsWith("/imports/");
    if (
      (superAdminOnly && role !== "super_admin") ||
      (managerOnly && role !== "super_admin" && role !== "campus_manager")
    ) {
      const destination = role === "student" ? "/leaderboard" : "/";
      const redirectResponse = NextResponse.redirect(
        new URL(destination, request.url),
      );
      response.cookies
        .getAll()
        .forEach((cookie) => redirectResponse.cookies.set(cookie));
      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/dashboard",
    "/dashboard/:path*",
    "/students",
    "/students/:path*",
    "/imports",
    "/imports/:path*",
    "/weekly-comparison",
    "/weekly-comparison/:path*",
    "/leaderboard/language",
    "/leaderboard/language/:path*",
    "/leaderboard",
    "/leaderboard/:path*",
    "/analytics",
    "/analytics/:path*",
    "/universities",
    "/universities/:path*",
    "/users",
    "/users/:path*",
    "/audit-logs",
    "/audit-logs/:path*",
    "/profile",
    "/student",
    "/student/:path*",
  ],
};
