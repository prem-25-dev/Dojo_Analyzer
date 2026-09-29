import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { requireSuperAdmin, writeAuditLog } from "@/lib/auth/authorization";
import { USER_ROLES, type UserRole } from "@/lib/auth/profile";
import { supabaseAdmin } from "@/lib/supabase/server";

async function listAuthUsers() {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function GET(request: Request) {
  const authorization = await requireSuperAdmin();
  if (authorization.response) return authorization.response;
  try {
    const searchParams = new URL(request.url).searchParams;
    const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
    const roleFilter = searchParams.get("role") ?? "all";
    const [
      authUsers,
      profilesResult,
      invitationsResult,
      universitiesResult,
      studentsResult,
    ] = await Promise.all([
      listAuthUsers(),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, role, university_id, student_id"),
      supabaseAdmin
        .from("user_invitations")
        .select(
          "email, full_name, role, university_id, student_id, updated_at",
        ),
      supabaseAdmin.from("universities").select("id, name").order("name"),
      supabaseAdmin.from("students").select("id, name, email").order("name"),
    ]);
    for (const result of [
      profilesResult,
      invitationsResult,
      universitiesResult,
      studentsResult,
    ])
      if (result.error) throw result.error;
    const authById = new Map(authUsers.map((user) => [user.id, user]));
    const universityNames = new Map(
      (universitiesResult.data ?? []).map((row) => [row.id, row.name]),
    );
    const studentNames = new Map(
      (studentsResult.data ?? []).map((row) => [row.id, row.name]),
    );
    const users = (profilesResult.data ?? []).map((profile) => {
      const authUser = authById.get(profile.id);
      return {
        email: authUser?.email ?? "",
        full_name: profile.full_name,
        role: profile.role,
        university_id: profile.university_id,
        university_name: profile.university_id
          ? (universityNames.get(profile.university_id) ?? null)
          : null,
        student_id: profile.student_id,
        student_name: profile.student_id
          ? (studentNames.get(profile.student_id) ?? null)
          : null,
        status: "active" as const,
      };
    });
    const invitations = (invitationsResult.data ?? []).map((invitation) => ({
      email: invitation.email,
      full_name: invitation.full_name,
      role: invitation.role,
      university_id: invitation.university_id,
      university_name: invitation.university_id
        ? (universityNames.get(invitation.university_id) ?? null)
        : null,
      student_id: invitation.student_id,
      student_name: invitation.student_id
        ? (studentNames.get(invitation.student_id) ?? null)
        : null,
      status: "pending" as const,
    }));
    const records = [...users, ...invitations].filter((user) => {
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesSearch =
        !search ||
        `${user.email} ${user.full_name ?? ""}`.toLowerCase().includes(search);
      return matchesRole && matchesSearch;
    });
    return NextResponse.json({
      users: records,
      roles: USER_ROLES,
      universities: universitiesResult.data ?? [],
      students: studentsResult.data ?? [],
    });
  } catch (error) {
    console.error("Super Admin users GET error:", error);
    return NextResponse.json(
      { error: "Unable to load users" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorization = await requireSuperAdmin();
  if (authorization.response) return authorization.response;
  try {
    if (!isUuid(authorization.user.id)) {
      throw new Error("Authenticated Super Admin ID is not a valid UUID");
    }
    const body = (await request.json()) as {
      email?: unknown;
      fullName?: unknown;
      role?: unknown;
      universityId?: unknown;
      studentId?: unknown;
    };
    const email = normalizeEmail(body.email);
    const fullName =
      typeof body.fullName === "string" ? body.fullName.trim() : "";
    const role = body.role as UserRole;
    const requestedUniversityId =
      typeof body.universityId === "string" ? body.universityId.trim() : "";
    const universityId =
      role === "super_admin" ? null : requestedUniversityId || null;
    if (
      !/^\S+@\S+\.\S+$/.test(email) ||
      !fullName ||
      !USER_ROLES.includes(role)
    ) {
      return NextResponse.json(
        { error: "A valid email, name, and supported role are required" },
        { status: 400 },
      );
    }
    if (
      (role === "super_admin" && (body.universityId || body.studentId)) ||
      (role !== "super_admin" && !universityId) ||
      (role !== "super_admin" && !isUuid(universityId ?? ""))
    ) {
      return NextResponse.json(
        {
          error:
            role === "super_admin"
              ? "Super Admin assignments must not include a university or student record"
              : "A valid university UUID is required for this role",
        },
        { status: 400 },
      );
    }
    if (universityId) {
      const { data, error } = await supabaseAdmin
        .from("universities")
        .select("id")
        .eq("id", universityId)
        .maybeSingle();
      if (error) throw error;
      if (!data)
        return NextResponse.json(
          { error: "University not found" },
          { status: 400 },
        );
    }

    let studentId: string | null = null;
    let studentUniversityId: string | null = null;
    if (role === "student") {
      const requestedStudentId =
        typeof body.studentId === "string" ? body.studentId.trim() : "";
      if (requestedStudentId && isUuid(requestedStudentId)) {
        studentId = requestedStudentId;
      } else {
        const studentEmail = normalizeEmail(requestedStudentId || email);
        if (!/^\S+@\S+\.\S+$/.test(studentEmail)) {
          return NextResponse.json(
            {
              error:
                "Select a student by record UUID or provide a student email",
            },
            { status: 400 },
          );
        }
        const { data: studentByEmail, error: studentByEmailError } =
          await supabaseAdmin
            .from("students")
            .select("id")
            .eq("email", studentEmail)
            .maybeSingle();
        if (studentByEmailError) throw studentByEmailError;
        if (!studentByEmail) {
          return NextResponse.json(
            { error: "No student record matches that email" },
            { status: 400 },
          );
        }
        studentId = studentByEmail.id;
      }

      const [studentResult, membershipResult] = await Promise.all([
        supabaseAdmin
          .from("students")
          .select("id")
          .eq("id", studentId)
          .maybeSingle(),
        supabaseAdmin
          .from("student_memberships")
          .select("squads!inner(university_id)")
          .eq("student_id", studentId)
          .is("end_date", null),
      ]);
      if (studentResult.error) throw studentResult.error;
      if (membershipResult.error) throw membershipResult.error;
      if (!studentResult.data)
        return NextResponse.json(
          { error: "Student record not found" },
          { status: 400 },
        );
      const universityIds = new Set(
        (membershipResult.data ?? [])
          .map((row) => {
            const squad = Array.isArray(row.squads)
              ? row.squads[0]
              : row.squads;
            return squad?.university_id;
          })
          .filter((id): id is string => Boolean(id)),
      );
      if (universityId && !universityIds.has(universityId))
        return NextResponse.json(
          { error: "The student does not belong to the selected university" },
          { status: 400 },
        );
      if (universityIds.size > 1 && !universityId)
        return NextResponse.json(
          { error: "Select the student's university" },
          { status: 400 },
        );
      studentUniversityId = universityId ?? [...universityIds][0] ?? null;
    }

    const authUser = (await listAuthUsers()).find(
      (user) => user.email?.toLowerCase() === email,
    );
    if (authUser && !isUuid(authUser.id)) {
      throw new Error("Authenticated account ID is not a valid UUID");
    }
    const assignment = {
      full_name: fullName,
      role,
      university_id: role === "student" ? studentUniversityId : universityId,
      student_id: role === "student" ? studentId : null,
    };

    if (authUser) {
      const { data: previous, error: previousError } = await supabaseAdmin
        .from("profiles")
        .select("role, university_id, student_id")
        .eq("id", authUser.id)
        .maybeSingle();
      if (previousError) throw previousError;
      const { error } = await supabaseAdmin
        .from("profiles")
        .upsert({ id: authUser.id, ...assignment }, { onConflict: "id" });
      if (error) throw error;
      const action =
        previous?.role && previous.role !== role
          ? "role_changed"
          : previous
            ? "user_assignment_updated"
            : "user_assigned";
      await writeAuditLog(
        authorization.user.id,
        action,
        "profile",
        authUser.id,
        {
          email,
          previous_role: previous?.role ?? null,
          role,
          university_id: assignment.university_id,
          student_id: assignment.student_id,
        },
      );
      if (studentId && previous?.student_id !== studentId)
        await writeAuditLog(
          authorization.user.id,
          "student_assigned",
          "profile",
          authUser.id,
          { email, student_id: studentId },
        );
      return NextResponse.json({ status: "active", email, role });
    }

    const { error } = await supabaseAdmin.from("user_invitations").upsert(
      {
        email,
        ...assignment,
        created_by: authorization.user.id,
      },
      { onConflict: "email" },
    );
    if (error) throw error;
    await writeAuditLog(
      authorization.user.id,
      "user_assignment",
      "invitation",
      email,
      {
        email,
        role,
        university_id: assignment.university_id,
        student_id: assignment.student_id,
      },
    );
    return NextResponse.json(
      { status: "pending", email, role },
      { status: 202 },
    );
  } catch (error) {
    console.error("Super Admin users POST error:", error);
    return NextResponse.json(
      { error: "Unable to assign user" },
      { status: 500 },
    );
  }
}
