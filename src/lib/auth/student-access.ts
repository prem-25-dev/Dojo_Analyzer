import "server-only";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Gives student records sign-in access with the "student" role.
 *
 * For each student email: if that person has already signed in (an auth user
 * exists) they get a student profile straight away; otherwise a pending
 * student invitation is stored, which the auth callback turns into a profile
 * on first sign-in. Staff accounts and staff invitations are never changed.
 */

type StudentRow = { id: string; name: string | null; email: string | null };

export type StudentAccessSummary = {
  activated: number;
  invited: number;
  skipped: number;
};

function normalize(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase();
}

async function listAuthUsersByEmail() {
  const byEmail = new Map<string, User>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    for (const user of data.users) {
      const email = normalize(user.email);
      if (email) byEmail.set(email, user);
    }
    if (data.users.length < 1000) return byEmail;
  }
}

/** University of each student's current squad. */
async function currentUniversities(studentIds: string[]) {
  const result = new Map<string, string>();
  for (let from = 0; from < studentIds.length; from += 500) {
    const { data, error } = await supabaseAdmin
      .from("student_memberships")
      .select("student_id, squads!inner(university_id)")
      .in("student_id", studentIds.slice(from, from + 500))
      .is("end_date", null);
    if (error) throw error;
    for (const row of data ?? []) {
      const squad = Array.isArray(row.squads) ? row.squads[0] : row.squads;
      if (squad?.university_id) result.set(row.student_id, squad.university_id);
    }
  }
  return result;
}

async function studentsByEmail(emails: string[]) {
  const rows: StudentRow[] = [];
  for (let from = 0; from < emails.length; from += 500) {
    const { data, error } = await supabaseAdmin
      .from("students")
      .select("id, name, email")
      .in("email", emails.slice(from, from + 500));
    if (error) throw error;
    rows.push(...((data ?? []) as StudentRow[]));
  }
  return rows;
}

export async function syncStudentAccess(
  rawEmails: Iterable<string | null | undefined>,
): Promise<StudentAccessSummary> {
  const summary: StudentAccessSummary = { activated: 0, invited: 0, skipped: 0 };
  const emails = [...new Set([...rawEmails].map(normalize).filter(Boolean))];
  if (!emails.length) return summary;

  const students = (await studentsByEmail(emails)).filter((row) =>
    normalize(row.email),
  );
  if (!students.length) return summary;

  const [authUsers, universities] = await Promise.all([
    listAuthUsersByEmail(),
    currentUniversities(students.map((student) => student.id)),
  ]);

  const authIds = students
    .map((student) => authUsers.get(normalize(student.email))?.id)
    .filter((id): id is string => Boolean(id));
  const [profilesResult, invitationsResult] = await Promise.all([
    authIds.length
      ? supabaseAdmin
          .from("profiles")
          .select("id, role, student_id, university_id")
          .in("id", authIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("user_invitations")
      .select("email, role")
      .in("email", students.map((student) => normalize(student.email))),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (invitationsResult.error) throw invitationsResult.error;
  const profiles = new Map(
    (profilesResult.data ?? []).map((row) => [row.id as string, row]),
  );
  const invitations = new Map(
    (invitationsResult.data ?? []).map((row) => [row.email as string, row]),
  );

  const profileUpserts: Array<Record<string, unknown>> = [];
  const invitationUpserts: Array<Record<string, unknown>> = [];

  for (const student of students) {
    const email = normalize(student.email);
    const assignment = {
      full_name: student.name?.trim() || email,
      role: "student",
      university_id: universities.get(student.id) ?? null,
      student_id: student.id,
    };
    const authUser = authUsers.get(email);
    if (authUser) {
      const profile = profiles.get(authUser.id);
      // Leave staff alone; only create or refresh student profiles.
      if (profile && profile.role !== "student") {
        summary.skipped += 1;
        continue;
      }
      if (
        profile?.student_id === student.id &&
        profile.university_id === assignment.university_id
      ) {
        summary.skipped += 1;
        continue;
      }
      profileUpserts.push({ id: authUser.id, ...assignment });
      summary.activated += 1;
    } else {
      const invitation = invitations.get(email);
      if (invitation && invitation.role !== "student") {
        summary.skipped += 1;
        continue;
      }
      invitationUpserts.push({ email, ...assignment });
      summary.invited += 1;
    }
  }

  if (profileUpserts.length) {
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert(profileUpserts, { onConflict: "id" });
    if (error) throw error;
  }
  if (invitationUpserts.length) {
    const { error } = await supabaseAdmin
      .from("user_invitations")
      .upsert(invitationUpserts, { onConflict: "email" });
    if (error) throw error;
  }
  return summary;
}

/**
 * Same as syncStudentAccess, but never throws: access sync must not fail the
 * import or edit that triggered it. Returns null when it could not run.
 */
export async function trySyncStudentAccess(
  emails: Iterable<string | null | undefined>,
): Promise<StudentAccessSummary | null> {
  try {
    return await syncStudentAccess(emails);
  } catch (error) {
    console.error("Student access sync failed:", error);
    return null;
  }
}
