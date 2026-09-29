import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createRequestSupabaseClient } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/auth/authorization";

function isManagerOrMentor(role: string) {
  return role === "campus_manager" || role === "mentor";
}

export async function GET(request: Request) {
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
      (!isManagerOrMentor(currentUser.profile.role) &&
        currentUser.profile.role !== "super_admin") ||
      (currentUser.profile.role !== "super_admin" &&
        !currentUser.profile.university_id)
    ) {
      return NextResponse.json(
        { error: "Squad access is not authorized" },
        { status: 403 },
      );
    }

    const requestedUniversityId =
      new URL(request.url).searchParams.get("university_id")?.trim() || null;
    if (
      currentUser.profile.role !== "super_admin" &&
      requestedUniversityId &&
      requestedUniversityId !== currentUser.profile.university_id
    ) {
      return NextResponse.json(
        { error: "University access is not authorized" },
        { status: 403 },
      );
    }
    let query = supabaseAdmin
      .from("squads")
      .select("id, squad_number, university_id, universities(name)")
      .order("squad_number", { ascending: true });
    const universityId =
      currentUser.profile.role === "super_admin"
        ? requestedUniversityId
        : currentUser.profile.university_id;
    if (universityId) query = query.eq("university_id", universityId);
    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      squads: (data ?? []).map((squad) => {
        const university = Array.isArray(squad.universities)
          ? squad.universities[0]
          : squad.universities;
        return {
          id: squad.id,
          squad_number: squad.squad_number,
          university_id: squad.university_id,
          university_name: university?.name ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("Squads GET error:", error);

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

    const body = (await request.json()) as {
      squadNumber?: unknown;
      universityId?: unknown;
    };
    const squadNumber =
      typeof body.squadNumber === "string" ? body.squadNumber.trim() : "";
    const universityId =
      currentUser.profile.role === "super_admin"
        ? typeof body.universityId === "string"
          ? body.universityId.trim()
          : ""
        : currentUser.profile.university_id!;

    if (!squadNumber || !universityId) {
      return NextResponse.json(
        { error: "squadNumber and universityId are required" },
        { status: 400 },
      );
    }
    if (currentUser.profile.role === "super_admin") {
      const { data: university, error } = await supabaseAdmin
        .from("universities")
        .select("id")
        .eq("id", universityId)
        .maybeSingle();
      if (error) throw error;
      if (!university)
        return NextResponse.json(
          { error: "University not found" },
          { status: 400 },
        );
    }

    const { data: existingSquad, error: existingSquadError } =
      await supabaseAdmin
        .from("squads")
        .select("id")
        .eq("squad_number", squadNumber)
        .eq("university_id", universityId)
        .limit(1)
        .maybeSingle();

    if (existingSquadError) {
      throw existingSquadError;
    }

    if (existingSquad) {
      return NextResponse.json(
        { error: "That squad number already exists at this university" },
        { status: 409 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("squads")
      .insert({
        squad_number: squadNumber,
        university_id: universityId,
      })
      .select("id, squad_number, university_id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "That squad number already exists at this university" },
          { status: 409 },
        );
      }

      throw error;
    }

    await writeAuditLog(
      currentUser.user.id,
      "squad_created",
      "squad",
      data.id,
      {
        university_id: universityId,
        squad_number: squadNumber,
      },
    );

    return NextResponse.json({ squad: data }, { status: 201 });
  } catch (error) {
    console.error("Squads POST error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
