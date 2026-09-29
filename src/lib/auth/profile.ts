import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

export const USER_ROLES = [
  "super_admin",
  "campus_manager",
  "mentor",
  "student",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type UserProfile = {
  id: string;
  full_name: string | null;
  role: UserRole;
  university_id: string | null;
  student_id: string | null;
};

type ProfileRow = Omit<UserProfile, "role"> & {
  role: string;
};

export type CurrentUserProfile =
  | {
      status: "authenticated";
      user: User;
      profile: UserProfile;
    }
  | {
      status: "unauthenticated";
      user: null;
      profile: null;
    }
  | {
      status: "unassigned" | "invalid_role";
      user: User;
      profile: null;
    }
  | {
      status: "error";
      user: User | null;
      profile: null;
      message: string;
    };

/** Google profile photo from the OAuth identity, when there is one. */
export function avatarUrlOf(user: User | null | undefined): string | null {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const url = meta.avatar_url ?? meta.picture;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

function isUserRole(role: string): role is UserRole {
  return USER_ROLES.includes(role as UserRole);
}

// ─── Browser cache ────────────────────────────────────────────────────────────
// Every page asks for the profile on mount. In the browser we share one
// lookup (for 5 minutes) so moving between pages doesn't flash a loading
// state; signing in or out clears it.
const CACHE_MS = 5 * 60 * 1000;
let cached: { at: number; promise: Promise<CurrentUserProfile> } | null = null;
let settled: CurrentUserProfile | null = null;
let listening = false;

export function clearProfileCache() {
  cached = null;
  settled = null;
}

/** The last resolved profile, if one is cached; lets pages skip a loading frame. */
export function peekCurrentUserProfile(): CurrentUserProfile | null {
  if (typeof window === "undefined" || !cached) return null;
  return Date.now() - cached.at < CACHE_MS ? settled : null;
}

export async function getCurrentUserProfile(
  client: SupabaseClient = supabase,
): Promise<CurrentUserProfile> {
  if (typeof window === "undefined" || client !== supabase)
    return loadCurrentUserProfile(client);

  if (!listening) {
    listening = true;
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "USER_UPDATED")
        clearProfileCache();
    });
  }
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    const entry = {
      at: Date.now(),
      promise: loadCurrentUserProfile(client).then((result) => {
        // Only keep answers worth reusing.
        if (result.status === "error") {
          if (cached === entry) cached = null;
        } else if (cached === entry) settled = result;
        return result;
      }),
    };
    cached = entry;
    settled = null;
  }
  return cached.promise;
}

async function loadCurrentUserProfile(
  client: SupabaseClient,
): Promise<CurrentUserProfile> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      status: "unauthenticated",
      user: null,
      profile: null,
    };
  }

  const { data: profileData, error } = await client
    .from("profiles")
    .select("id, full_name, role, university_id, student_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return {
      status: "error",
      user,
      profile: null,
      message: "Unable to load your account profile.",
    };
  }

  if (!profileData) {
    return {
      status: "unassigned",
      user,
      profile: null,
    };
  }

  const profile = profileData as ProfileRow;

  if (
    !isUserRole(profile.role) ||
    (profile.role === "super_admin" &&
      (profile.university_id !== null || profile.student_id !== null)) ||
    ((profile.role === "campus_manager" || profile.role === "mentor") &&
      (!profile.university_id || profile.student_id !== null)) ||
    (profile.role === "student" && !profile.student_id)
  ) {
    return {
      status: "invalid_role",
      user,
      profile: null,
    };
  }

  return {
    status: "authenticated",
    user,
    profile: {
      ...profile,
      role: profile.role,
    },
  };
}
