import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  getCurrentUserProfile,
  type UserProfile,
  type UserRole,
} from "@/lib/auth/profile";
import { createRequestSupabaseClient } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export type AuthorizedRequest =
  | { profile: UserProfile; user: User; response?: never }
  | { profile?: never; user?: never; response: NextResponse };

export async function requireRoles(
  roles: readonly UserRole[],
): Promise<AuthorizedRequest> {
  const client = await createRequestSupabaseClient();
  const current = await getCurrentUserProfile(client);

  if (current.status === "unauthenticated") {
    return {
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    };
  }
  if (
    current.status !== "authenticated" ||
    !roles.includes(current.profile.role)
  ) {
    return {
      response: NextResponse.json(
        { error: "Access is not authorized" },
        { status: 403 },
      ),
    };
  }

  return { profile: current.profile, user: current.user };
}

export async function requireSuperAdmin(): Promise<AuthorizedRequest> {
  return requireRoles(["super_admin"]);
}

export async function writeAuditLog(
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: actorUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
  });
  if (error) throw error;
}
