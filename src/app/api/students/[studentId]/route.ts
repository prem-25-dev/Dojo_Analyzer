import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createRequestSupabaseClient } from "@/lib/auth/server";
import { writeAuditLog } from "@/lib/auth/authorization";
import { supabaseAdmin } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ studentId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const supabase = await createRequestSupabaseClient();
    const currentUser = await getCurrentUserProfile(supabase);

    if (currentUser.status === "unauthenticated") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    if (
      currentUser.status !== "authenticated" ||
      (currentUser.profile.role !== "campus_manager" &&
        currentUser.profile.role !== "super_admin") ||
      (currentUser.profile.role === "campus_manager" &&
        !currentUser.profile.university_id)
    ) {
      return NextResponse.json(
        { error: "Campus Manager authorization required" },
        { status: 403 },
      );
    }

    const { studentId } = await context.params;
    const isSuperAdmin = currentUser.profile.role === "super_admin";
    const universityId = currentUser.profile.university_id;
    const body = (await request.json()) as {
      name?: unknown;
      email?: unknown;
      squadId?: unknown;
    };
    const updates: { name?: string; email?: string } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json(
          { error: "name must be non-empty" },
          { status: 400 },
        );
      }
      updates.name = body.name.trim();
    }

    if (body.email !== undefined) {
      if (typeof body.email !== "string" || !body.email.trim()) {
        return NextResponse.json(
          { error: "email must be non-empty" },
          { status: 400 },
        );
      }
      updates.email = body.email.trim().toLowerCase();
    }

    const squadId =
      body.squadId === undefined
        ? undefined
        : typeof body.squadId === "string"
          ? body.squadId.trim()
          : "";

    if (squadId !== undefined && !squadId) {
      return NextResponse.json(
        { error: "squadId must be non-empty" },
        { status: 400 },
      );
    }

    const { data: currentMembership, error: membershipError } =
      await supabaseAdmin
        .from("student_memberships")
        .select("student_id, squad_id, start_date, end_date")
        .eq("student_id", studentId)
        .is("end_date", null)
        .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }

    if (!currentMembership) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    let currentSquadQuery = supabaseAdmin
      .from("squads")
      .select("id")
      .eq("id", currentMembership.squad_id);
    if (!isSuperAdmin)
      currentSquadQuery = currentSquadQuery.eq("university_id", universityId!);
    const { data: currentSquad, error: currentSquadError } =
      await currentSquadQuery.maybeSingle();

    if (currentSquadError) {
      throw currentSquadError;
    }

    if (!currentSquad) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    if (squadId !== undefined && squadId !== currentMembership.squad_id) {
      let newSquadQuery = supabaseAdmin
        .from("squads")
        .select("id, squad_number, university_id")
        .eq("id", squadId);
      if (!isSuperAdmin)
        newSquadQuery = newSquadQuery.eq("university_id", universityId!);
      const { data: newSquad, error: newSquadError } =
        await newSquadQuery.maybeSingle();

      if (newSquadError) {
        throw newSquadError;
      }

      if (!newSquad) {
        return NextResponse.json({ error: "Squad not found" }, { status: 404 });
      }
    }

    if (updates.email) {
      const { data: existingStudent, error: existingStudentError } =
        await supabaseAdmin
          .from("students")
          .select("id")
          .eq("email", updates.email)
          .neq("id", studentId)
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
    }

    if (Object.keys(updates).length > 0) {
      const { error: studentUpdateError } = await supabaseAdmin
        .from("students")
        .update(updates)
        .eq("id", studentId);

      if (studentUpdateError) {
        if (studentUpdateError.code === "23505") {
          return NextResponse.json(
            { error: "A student with this email already exists" },
            { status: 409 },
          );
        }

        throw studentUpdateError;
      }
    }

    let membership = currentMembership;

    if (squadId !== undefined && squadId !== currentMembership.squad_id) {
      const currentDate = new Date().toISOString().slice(0, 10);
      const { error: endMembershipError } = await supabaseAdmin
        .from("student_memberships")
        .update({ end_date: currentDate })
        .eq("student_id", studentId)
        .eq("squad_id", currentMembership.squad_id)
        .is("end_date", null);

      if (endMembershipError) {
        throw endMembershipError;
      }

      const { data: newMembership, error: newMembershipError } =
        await supabaseAdmin
          .from("student_memberships")
          .insert({
            student_id: studentId,
            squad_id: squadId,
            start_date: currentDate,
          })
          .select("student_id, squad_id, start_date, end_date")
          .single();

      if (newMembershipError) {
        throw newMembershipError;
      }

      membership = newMembership;
      await writeAuditLog(
        currentUser.user.id,
        "student_assignment",
        "student",
        studentId,
        { squad_id: squadId },
      );
    }

    const { data: student, error: studentError } = await supabaseAdmin
      .from("students")
      .select("id, name, email")
      .eq("id", studentId)
      .single();

    if (studentError) {
      throw studentError;
    }

    let finalSquadQuery = supabaseAdmin
      .from("squads")
      .select("id, squad_number, university_id")
      .eq("id", membership.squad_id);
    if (!isSuperAdmin)
      finalSquadQuery = finalSquadQuery.eq("university_id", universityId!);
    const { data: squad, error: squadError } = await finalSquadQuery.single();

    if (squadError) {
      throw squadError;
    }

    return NextResponse.json({
      student: {
        ...student,
        squad_id: squad.id,
        squad_number: squad.squad_number,
        start_date: membership.start_date,
        end_date: membership.end_date,
      },
    });
  } catch (error) {
    console.error("Student PATCH error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
