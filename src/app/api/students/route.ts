import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createRequestSupabaseClient } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/auth/authorization";

function isManagerOrMentor(role: string) {
  return role === "campus_manager" || role === "mentor";
}

async function getAuthorizedUser() {
  const supabase = await createRequestSupabaseClient();
  const currentUser = await getCurrentUserProfile(supabase);

  if (currentUser.status === "unauthenticated") {
    return {
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    };
  }

  if (
    currentUser.status !== "authenticated" ||
    (!isManagerOrMentor(currentUser.profile.role) &&
      currentUser.profile.role !== "super_admin") ||
    (currentUser.profile.role !== "super_admin" &&
      !currentUser.profile.university_id)
  ) {
    return {
      response: NextResponse.json(
        { error: "Student access is not authorized" },
        { status: 403 },
      ),
    };
  }

  return { profile: currentUser.profile };
}

export async function GET(request: Request) {
  try {
    const authorization = await getAuthorizedUser();

    if (authorization.response) {
      return authorization.response;
    }

    const searchParams = new URL(request.url).searchParams;
    const requestedUniversityId =
      searchParams.get("university_id")?.trim() || null;
    const requestedSquadId = searchParams.get("squad_id")?.trim() || null;
    if (
      authorization.profile.role !== "super_admin" &&
      requestedUniversityId &&
      requestedUniversityId !== authorization.profile.university_id
    ) {
      return NextResponse.json(
        { error: "University access is not authorized" },
        { status: 403 },
      );
    }
    let query = supabaseAdmin
      .from("student_memberships")
      .select(
        "student_id, start_date, end_date, students!inner(id, name, email), squads!inner(id, squad_number, university_id, universities(name))",
      )
      .is("end_date", null)
      .order("start_date", { ascending: false });
    const universityId =
      authorization.profile.role === "super_admin"
        ? requestedUniversityId
        : authorization.profile.university_id;
    if (universityId) query = query.eq("squads.university_id", universityId);
    if (requestedSquadId) query = query.eq("squads.id", requestedSquadId);
    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const studentsById = new Map<
      string,
      {
        id: string;
        name: string | null;
        email: string | null;
        squad_id: string | null;
        squad_number: string | null;
        university_name: string | null;
        start_date: string | null;
        end_date: string | null;
      }
    >();

    for (const membership of data ?? []) {
      const student = Array.isArray(membership.students)
        ? membership.students[0]
        : membership.students;
      const squad = Array.isArray(membership.squads)
        ? membership.squads[0]
        : membership.squads;
      const university = squad?.universities
        ? Array.isArray(squad.universities)
          ? squad.universities[0]
          : squad.universities
        : null;

      const studentRow = {
        id: student?.id ?? membership.student_id,
        name: student?.name ?? null,
        email: student?.email ?? null,
        squad_id: squad?.id ?? null,
        squad_number: squad?.squad_number ?? null,
        university_name: university?.name ?? null,
        start_date: membership.start_date,
        end_date: membership.end_date,
      };

      if (!studentsById.has(studentRow.id)) {
        studentsById.set(studentRow.id, studentRow);
      }
    }

    const students = Array.from(studentsById.values());

    return NextResponse.json({ students });
  } catch (error) {
    console.error("Students GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await getAuthorizedUser();

    if (authorization.response) {
      return authorization.response;
    }

    if (
      authorization.profile.role !== "campus_manager" &&
      authorization.profile.role !== "super_admin"
    ) {
      return NextResponse.json(
        { error: "Campus Manager authorization required" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      name?: unknown;
      email?: unknown;
      squadId?: unknown;
      universityId?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const squadId = typeof body.squadId === "string" ? body.squadId.trim() : "";
    const universityId =
      authorization.profile.role === "super_admin"
        ? typeof body.universityId === "string"
          ? body.universityId.trim()
          : ""
        : authorization.profile.university_id!;

    if (!name || !email || !squadId || !universityId) {
      return NextResponse.json(
        { error: "name, email, squadId, and universityId are required" },
        { status: 400 },
      );
    }

    const { data: squad, error: squadError } = await supabaseAdmin
      .from("squads")
      .select("id, squad_number, university_id")
      .eq("id", squadId)
      .eq("university_id", universityId)
      .maybeSingle();

    if (squadError) {
      throw squadError;
    }

    if (!squad) {
      return NextResponse.json({ error: "Squad not found" }, { status: 404 });
    }

    const { data: existingStudent, error: existingStudentError } =
      await supabaseAdmin
        .from("students")
        .select("id")
        .eq("email", email)
        .maybeSingle();

    if (existingStudentError) {
      throw existingStudentError;
    }

    if (existingStudent) {
      return NextResponse.json(
        { error: "A student with this email already exists" },
        { status: 409 },
      );
    }

    const { data: student, error: studentError } = await supabaseAdmin
      .from("students")
      .insert({ name, email })
      .select("id, name, email")
      .single();

    if (studentError) {
      if (studentError.code === "23505") {
        return NextResponse.json(
          { error: "A student with this email already exists" },
          { status: 409 },
        );
      }

      throw studentError;
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("student_memberships")
      .insert({
        student_id: student.id,
        squad_id: squad.id,
        start_date: new Date().toISOString(),
      })
      .select("student_id, squad_id, start_date, end_date")
      .single();

    if (membershipError) {
      throw membershipError;
    }

    await writeAuditLog(
      authorization.profile.id,
      "student_assignment",
      "student",
      student.id,
      {
        university_id: universityId,
        squad_id: squad.id,
      },
    );

    return NextResponse.json(
      {
        student: {
          ...student,
          squad_id: squad.id,
          squad_number: squad.squad_number,
          start_date: membership.start_date,
          end_date: membership.end_date,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Students POST error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
