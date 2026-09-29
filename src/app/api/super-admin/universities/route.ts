import { NextResponse } from "next/server";
import { requireSuperAdmin, writeAuditLog } from "@/lib/auth/authorization";
import { supabaseAdmin } from "@/lib/supabase/server";

async function loadUniversityCounts() {
  const [universities, squads, memberships, profiles] = await Promise.all([
    supabaseAdmin.from("universities").select("id, name").order("name"),
    supabaseAdmin.from("squads").select("university_id"),
    supabaseAdmin
      .from("student_memberships")
      .select("student_id, squads!inner(university_id)")
      .is("end_date", null),
    supabaseAdmin.from("profiles").select("role, university_id"),
  ]);
  for (const result of [universities, squads, memberships, profiles]) {
    if (result.error) throw result.error;
  }

  const counts = new Map<
    string,
    { students: Set<string>; squads: number; mentors: number; managers: number }
  >();
  for (const university of universities.data ?? [])
    counts.set(university.id, {
      students: new Set(),
      squads: 0,
      mentors: 0,
      managers: 0,
    });
  for (const squad of squads.data ?? []) {
    const count = counts.get(squad.university_id);
    if (count) count.squads += 1;
  }
  for (const membership of memberships.data ?? []) {
    const related = Array.isArray(membership.squads)
      ? membership.squads[0]
      : membership.squads;
    const count = related ? counts.get(related.university_id) : undefined;
    if (count) count.students.add(membership.student_id);
  }
  for (const profile of profiles.data ?? []) {
    const count = profile.university_id
      ? counts.get(profile.university_id)
      : undefined;
    if (count && profile.role === "mentor") count.mentors += 1;
    if (count && profile.role === "campus_manager") count.managers += 1;
  }

  return (universities.data ?? []).map((university) => {
    const count = counts.get(university.id)!;
    return {
      ...university,
      student_count: count.students.size,
      squad_count: count.squads,
      mentor_count: count.mentors,
      campus_manager_count: count.managers,
    };
  });
}

export async function GET() {
  const authorization = await requireSuperAdmin();
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json({ universities: await loadUniversityCounts() });
  } catch (error) {
    console.error("Super Admin universities GET error:", error);
    return NextResponse.json(
      { error: "Unable to load universities" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorization = await requireSuperAdmin();
  if (authorization.response) return authorization.response;
  try {
    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name)
      return NextResponse.json(
        { error: "University name is required" },
        { status: 400 },
      );

    const { data, error } = await supabaseAdmin
      .from("universities")
      .insert({ name })
      .select("id, name")
      .single();
    if (error) {
      if (error.code === "23505")
        return NextResponse.json(
          { error: "That university already exists" },
          { status: 409 },
        );
      throw error;
    }
    await writeAuditLog(
      authorization.user.id,
      "university_created",
      "university",
      data.id,
      { name },
    );
    return NextResponse.json({ university: data }, { status: 201 });
  } catch (error) {
    console.error("Super Admin universities POST error:", error);
    return NextResponse.json(
      { error: "Unable to create university" },
      { status: 500 },
    );
  }
}
