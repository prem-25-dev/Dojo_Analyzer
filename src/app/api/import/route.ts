import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { trySyncStudentAccess } from "@/lib/auth/student-access";
import { writeAuditLog } from "@/lib/auth/authorization";
import {
  deduplicateRowsByWeekAndEmail,
  planStudentProvisioning,
  resolveWeeksForRows,
  validateImportRows,
  type CSVRow,
  type ImportWeek,
  type ImportValidationError,
  type ValidatedRecord,
} from "@/lib/import/validation";
import { supabaseAdmin } from "@/lib/supabase/server";

const STUDENT_PAGE_SIZE = 500;

type ImportRowOutcome = {
  row_number: number;
  student_name: string;
  squad_number: string;
  student_status: "created" | "existing" | "not_created";
  membership_status:
    | "added"
    | "already_in_squad"
    | "another_squad"
    | "squad_not_found"
    | "not_added";
  other_squad_number: string | null;
  belt_import_status: "imported" | "validation_error" | "not_imported";
  errors: string[];
};

type ImportMembership = {
  student_id: string;
  start_date: string | null;
  end_date: string | null;
  squads:
    | { id: string; squad_number: string; university_id: string }
    | Array<{ id: string; squad_number: string; university_id: string }>
    | null;
};

  type ImportStudent = { id: string; name: string | null; email: string };
  type ImportSquad = { id: string; squad_number: string; university_id: string };

  type MultiWeekBatch = {
    week: ImportWeek;
    rows: CSVRow[];
    rowNumbers: number[];
    records: ValidatedRecord[];
  };

  type PreparedMultiWeekImport = {
    academicYear: number;
    weeks: ImportWeek[];
    weekByRow: Map<number, ImportWeek>;
    rowResults: ImportRowOutcome[];
    errors: ImportValidationError[];
    studentsToCreate: Array<{ id: string; name: string; email: string }>;
    membershipsToCreate: Array<{
      email: string;
      squad_id: string;
      start_date: string;
    }>;
    studentIdByEmail: Map<string, string>;
    expectedWeeks: Array<{ id: string; date: string; week_number: number }>;
    newDateWeeks: Array<{ proposed_id: string; date: string; week_number: number }>;
    weekNumberUpdates: Array<{
      id: string;
      current_week_number: number;
      week_number: number;
    }>;
    batches: MultiWeekBatch[];
    groups: Array<{
      week_id: string;
      week_number: number;
      academic_year: number;
      start_date: string;
      end_date: string;
      row_count: number;
      squads: string[];
    }>;
    squadsProcessed: number;
    existingStudents: number;
  };

async function findStudentsByNormalizedEmail(emails: Set<string>) {
  const matchingStudents: { id: string; name: string | null; email: string }[] = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supabaseAdmin
      .from("students")
      .select("id, name, email")
      .order("id", { ascending: true })
      .range(page * STUDENT_PAGE_SIZE, (page + 1) * STUDENT_PAGE_SIZE - 1);

    if (error) throw error;

    for (const student of data ?? []) {
      if (emails.has(student.email.trim().toLowerCase())) {
        matchingStudents.push(student);
      }
    }

    if ((data ?? []).length < STUDENT_PAGE_SIZE) break;
  }

  return matchingStudents;
}

async function loadMemberships(studentIds: string[]): Promise<ImportMembership[]> {
  if (studentIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("student_memberships")
    .select(
      "student_id, start_date, end_date, squads!inner(id, squad_number, university_id)",
    )
    .in("student_id", studentIds);

  if (error) throw error;
  return (data ?? []) as ImportMembership[];
}

async function loadUniversityWeeks(universityId: string): Promise<ImportWeek[]> {
  const weeks: ImportWeek[] = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabaseAdmin
      .from("weeks")
      .select("id, university_id, academic_year, week_number, start_date, end_date")
      .eq("university_id", universityId)
      .order("academic_year", { ascending: true })
      .order("week_number", { ascending: true })
      .range(page * STUDENT_PAGE_SIZE, (page + 1) * STUDENT_PAGE_SIZE - 1);
    if (error) throw error;
    weeks.push(...((data ?? []) as ImportWeek[]));
    if ((data ?? []).length < STUDENT_PAGE_SIZE) break;
  }
  return weeks;
}

async function prepareMultiWeekImport(
  rows: CSVRow[],
  universityId: string,
  academicYear: number,
): Promise<PreparedMultiWeekImport> {
  const weeks = await loadUniversityWeeks(universityId);
  const resolution = resolveWeeksForRows(
    rows,
    weeks,
    universityId,
    academicYear,
    () => crypto.randomUUID(),
  );
  const deduplicatedRows = deduplicateRowsByWeekAndEmail(rows, resolution.weekByRow);
  const selectedRows = deduplicatedRows.rows.map(({ row }) => row);
  const emails = new Set(
    selectedRows
      .map((row) => row.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );
  const squadNumbers = [
    ...new Set(selectedRows.map((row) => row.squad_number?.trim()).filter(Boolean)),
  ];
  const students = await findStudentsByNormalizedEmail(emails);
  const memberships = await loadMemberships(
    students.map((student) => student.id),
  );
  const { data: squads, error: squadsError } = squadNumbers.length
    ? await supabaseAdmin
        .from("squads")
        .select("id, squad_number, university_id")
        .eq("university_id", universityId)
        .in("squad_number", squadNumbers)
    : { data: [], error: null };
  if (squadsError) throw squadsError;

  const preflight = validateImportRows({
    rows: selectedRows,
    students,
    memberships,
    squads: squads ?? [],
    weekByRow: resolution.weekByRow,
    universityId,
    allowStudentProvisioning: true,
  });
  const studentPlan = planStudentProvisioning({
    rows: selectedRows,
    students,
    memberships,
    squads: squads ?? [],
    universityId,
    createStudentId: () => crypto.randomUUID(),
  });

  const studentsForStrictValidation = [
    ...students,
    ...studentPlan.studentsToCreate,
  ];
  const squadsById = new Map((squads ?? []).map((squad) => [squad.id, squad]));
  const plannedMemberships = studentPlan.membershipsToCreate.flatMap(
    (membership): ImportMembership[] => {
      const studentId = studentPlan.studentIdByEmail.get(membership.email);
      const squad = squadsById.get(membership.squad_id);
      if (!studentId || !squad) return [];
      return [{
        student_id: studentId,
        start_date: membership.start_date,
        end_date: null,
        squads: squad,
      }];
    },
  );
  const strictValidation = validateImportRows({
    rows: selectedRows,
    students: studentsForStrictValidation,
    memberships: [...memberships, ...plannedMemberships],
    squads: squads ?? [],
    weekByRow: resolution.weekByRow,
    universityId,
  });
  const errorsByRow = new Map<number, string[]>();
  for (const error of [
    ...deduplicatedRows.errors,
    ...resolution.errors,
    ...preflight.errors,
    ...studentPlan.errors,
    ...strictValidation.errors,
  ]) {
    const existing = errorsByRow.get(error.row_number) ?? [];
    if (!existing.includes(error.error_message)) {
      errorsByRow.set(error.row_number, [...existing, error.error_message]);
    }
  }
  const errors = Array.from(errorsByRow.entries()).flatMap(
    ([rowNumber, messages]) =>
      messages.map((errorMessage) => ({
        row_number: rowNumber,
        field_name: "row",
        error_message: errorMessage,
        raw_value: selectedRows[rowNumber - 2]?.id ?? "",
      })),
  );

  const batchesByWeek = new Map<string, MultiWeekBatch>();
  const recordsBySourceId = new Map(
    strictValidation.records.map((record) => [record.source_record_id, record]),
  );
  selectedRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const week = resolution.weekByRow.get(rowNumber);
    if (!week) return;
    const batch = batchesByWeek.get(week.id) ?? {
      week,
      rows: [],
      rowNumbers: [],
      records: [],
    };
    batch.rows.push(row);
    batch.rowNumbers.push(rowNumber);
    const record = recordsBySourceId.get(row.id?.trim() ?? "");
    if (record) batch.records.push(record);
    batchesByWeek.set(week.id, batch);
  });
  const batches = Array.from(batchesByWeek.values()).sort(
    (left, right) =>
      left.week.academic_year - right.week.academic_year ||
      left.week.week_number - right.week.week_number,
  );
  const groups = batches.map((batch) => ({
    week_id: batch.week.id,
    week_number: batch.week.week_number,
    academic_year: batch.week.academic_year,
    start_date: batch.week.start_date,
    end_date: batch.week.end_date,
    row_count: batch.rows.length,
    squads: Array.from(
      new Set(batch.rows.map((row) => row.squad_number?.trim()).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
  }));
  const rowResults: ImportRowOutcome[] = selectedRows.map((row, index) => {
    const rowNumber = index + 2;
    const email = row.email?.trim().toLowerCase() ?? "";
    const student = students.find(
      (candidate) => candidate.email.trim().toLowerCase() === email,
    );
    const assignedStatus = studentPlan.studentStatusByEmail.get(email);
    const errorsForRow = errorsByRow.get(rowNumber) ?? [];
    const otherSquadMatch = errorsForRow
      .join(" ")
      .match(/already assigned to squad\s+([^.]*)/i);
    return {
      row_number: rowNumber,
      student_name: row.student_name,
      squad_number: row.squad_number,
      student_status:
        assignedStatus === "created"
          ? "created"
          : student || assignedStatus === "existing"
            ? "existing"
            : "not_created",
      membership_status: otherSquadMatch
        ? "another_squad"
        : errorsForRow.some((message) => message.startsWith("Squad "))
          ? "squad_not_found"
          : studentPlan.membershipStatusByEmail.get(email) ?? "not_added",
      other_squad_number: otherSquadMatch?.[1] ?? null,
      belt_import_status: errorsForRow.length ? "validation_error" : "not_imported",
      errors: errorsForRow,
    };
  });

  return {
    academicYear,
    weeks,
    weekByRow: resolution.weekByRow,
    rowResults,
    errors,
    studentsToCreate: studentPlan.studentsToCreate,
    membershipsToCreate: studentPlan.membershipsToCreate,
    studentIdByEmail: studentPlan.studentIdByEmail,
    expectedWeeks: resolution.expectedWeeks,
    newDateWeeks: resolution.newDateWeeks,
    weekNumberUpdates: resolution.weekNumberUpdates,
    batches,
    groups,
    squadsProcessed: new Set(
      selectedRows.map((row) => row.squad_number?.trim()).filter(Boolean),
    ).size,
    existingStudents: studentPlan.studentStatusByEmail.size - studentPlan.studentsToCreate.length,
  };
}

async function provisionDistinctStudentRows({
  rows,
  students: initialStudents,
  memberships: initialMemberships,
  squads,
  universityId,
  actorUserId,
  membershipStartDate,
}: {
  rows: CSVRow[];
  students: ImportStudent[];
  memberships: ImportMembership[];
  squads: ImportSquad[];
  universityId: string;
  actorUserId: string;
  membershipStartDate?: string;
}): Promise<{ students: ImportStudent[]; rowResults: ImportRowOutcome[] }> {
  const students = [...initialStudents];
  const memberships = [...initialMemberships];
  const studentsByEmail = new Map(
    students.map((student) => [student.email.trim().toLowerCase(), student]),
  );
  const squadsByNumber = new Map(
    squads
      .filter((squad) => squad.university_id === universityId)
      .map((squad) => [squad.squad_number.trim(), squad]),
  );
  const groupedRows = new Map<
    string,
    { email: string; entries: Array<{ row: CSVRow; rowNumber: number }> }
  >();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const email = row.email?.trim().toLowerCase() ?? "";
    const groupKey = email || `missing-email:${rowNumber}`;
    const group = groupedRows.get(groupKey) ?? { email, entries: [] };
    group.entries.push({ row, rowNumber });
    groupedRows.set(groupKey, group);
  });

  const outcomes: ImportRowOutcome[] = [];
  for (const group of groupedRows.values()) {
    const firstEntry = group.entries[0];
    const firstRow = firstEntry.row;
    const studentName = firstRow.student_name?.trim() ?? "";
    const squadNumber = firstRow.squad_number?.trim() ?? "";
    const errors: string[] = [];
    const distinctNames = new Set(
      group.entries.map(({ row }) => row.student_name?.trim().replace(/\s+/g, " ").toLowerCase() ?? ""),
    );
    const distinctSquads = new Set(
      group.entries.map(({ row }) => row.squad_number?.trim() ?? ""),
    );

    if (!group.email) errors.push("Student email is required");
    if (!studentName) errors.push("Student name is required");
    if (!squadNumber) errors.push("Squad number is required");
    if (distinctNames.size > 1) {
      errors.push("Student name differs between rows for this email");
    }
    if (distinctSquads.size > 1) {
      errors.push("Student is listed in multiple squads in the CSV");
    }

    const squad = squadsByNumber.get(squadNumber);
    if (squadNumber && !squad) {
      errors.push(`Squad ${squadNumber} does not exist in your university.`);
    }

    let student = studentsByEmail.get(group.email);
    let studentStatus: ImportRowOutcome["student_status"] = student
      ? "existing"
      : "not_created";
    if (student && studentName.replace(/\s+/g, " ").toLowerCase() !== (student.name ?? "").trim().replace(/\s+/g, " ").toLowerCase()) {
      errors.push("Student name does not match registered student");
    }

    let activeMembership: ImportMembership | undefined;
    let otherMembership: ImportMembership | undefined;
    if (student && squad) {
      const activeMemberships = memberships.filter(
        (membership) => membership.student_id === student?.id && !membership.end_date,
      );
      activeMembership = activeMemberships.find((membership) => {
        const membershipSquad = Array.isArray(membership.squads)
          ? membership.squads[0]
          : membership.squads;
        return membershipSquad?.id === squad.id;
      });
      otherMembership = activeMemberships.find((membership) => {
        const membershipSquad = Array.isArray(membership.squads)
          ? membership.squads[0]
          : membership.squads;
        return membershipSquad?.id !== squad.id;
      });
      if (otherMembership) {
        const otherSquad = Array.isArray(otherMembership.squads)
          ? otherMembership.squads[0]
          : otherMembership.squads;
        errors.push(
          `Student is already assigned to squad ${otherSquad?.squad_number ?? "another squad"}.`,
        );
      }
    }

    let membershipStatus: ImportRowOutcome["membership_status"] = squad
      ? "not_added"
      : "squad_not_found";
    if (errors.length === 0 && squad) {
      if (!student) {
        const { data, error } = await supabaseAdmin
          .from("students")
          .insert({ name: studentName, email: group.email })
          .select("id, name, email")
          .single();
        if (error) throw error;
        student = data;
        studentStatus = "created";
        students.push(student);
        studentsByEmail.set(group.email, student);
        await writeAuditLog(actorUserId, "student_created", "student", student.id, {
          university_id: universityId,
          source: "belt_csv",
        });
      }

      if (activeMembership) {
        membershipStatus = "already_in_squad";
      } else {
        const startDate = membershipStartDate ?? group.entries
          .map(({ row }) => new Date(row.start_time ?? ""))
          .filter((date) => !Number.isNaN(date.getTime()))
          .sort((left, right) => left.getTime() - right.getTime())[0]
          ?.toISOString()
          .slice(0, 10) ?? new Date().toISOString().slice(0, 10);
        const { data, error } = await supabaseAdmin
          .from("student_memberships")
          .insert({
            student_id: student.id,
            squad_id: squad.id,
            start_date: startDate,
          })
          .select("student_id, squad_id, start_date, end_date")
          .single();
        if (error) throw error;
        membershipStatus = "added";
        memberships.push({
          student_id: data.student_id,
          start_date: data.start_date,
          end_date: data.end_date,
          squads: squad,
        });
        await writeAuditLog(actorUserId, "student_assignment", "student", student.id, {
          university_id: universityId,
          squad_id: squad.id,
          source: "belt_csv",
        });
      }
    } else if (otherMembership) {
      membershipStatus = "another_squad";
    }

    outcomes.push({
      row_number: firstEntry.rowNumber,
      student_name: studentName,
      squad_number: squadNumber,
      student_status: studentStatus,
      membership_status: membershipStatus,
      other_squad_number: otherMembership
        ? (Array.isArray(otherMembership.squads)
            ? otherMembership.squads[0]
            : otherMembership.squads)?.squad_number ?? null
        : null,
      belt_import_status: "not_imported",
      errors,
    });
  }

  return { students, rowResults: outcomes };
}

function sanitizeFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || "upload.csv";
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized || "upload.csv";
}

const SENSITIVE_LOG_FIELD_PATTERN = /token|secret|key|cookie|authorization|jwt|password|session/i;

function redactSensitiveValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value;
  }
  if (typeof value === "object") {
    if (seen.has(value as object)) return "[Circular]";
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.map((entry) => redactSensitiveValue(entry, seen));
    }

    if (value instanceof Date) return value.toISOString();
    if (value instanceof URL) return value.toString();

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        const isSensitive = SENSITIVE_LOG_FIELD_PATTERN.test(key);
        return [key, isSensitive ? "[REDACTED]" : redactSensitiveValue(entry, seen)];
      }),
    );
  }

  return value;
}

function serializeErrorDetails(error: unknown) {
  const details: {
    name?: string;
    message?: string;
    stack?: string;
    code?: string | number;
    details?: string;
    hint?: string;
  } = {};

  const readField = (fieldName: string) => {
    if (!error || typeof error !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(error, fieldName);
    if (descriptor && descriptor.value !== undefined) return descriptor.value;
    const candidate = (error as Record<string, unknown>)[fieldName];
    return candidate !== undefined ? candidate : undefined;
  };

  if (error instanceof Error) {
    details.name = error.name || "Error";
    details.message = error.message || "Unknown server error";
    details.stack = error.stack;
  }

  for (const field of ["name", "message", "stack", "code", "details", "hint"] as const) {
    const value = readField(field);
    if (value === undefined) continue;
    if (field === "message") details.message = typeof value === "string" ? value : String(value);
    else if (field === "stack") details.stack = typeof value === "string" ? value : String(value);
    else if (field === "name") details.name = typeof value === "string" ? value : String(value);
    else if (field === "code") details.code = typeof value === "string" || typeof value === "number" ? value : String(value);
    else if (field === "details") details.details = typeof value === "string" ? value : String(value);
    else if (field === "hint") details.hint = typeof value === "string" ? value : String(value);
  }

  if (!details.message && typeof error === "string") details.message = error;
  if (!details.message && typeof error === "object" && error) {
    const maybeMessage = (error as Record<string, unknown>).error;
    if (typeof maybeMessage === "string") details.message = maybeMessage;
  }

  const sanitizedSource = redactSensitiveValue(error);
  if (
    sanitizedSource &&
    typeof sanitizedSource === "object" &&
    !Array.isArray(sanitizedSource)
  ) {
    const sanitizedRecord = sanitizedSource as Record<string, unknown>;
    for (const key of ["name", "message", "stack", "code", "details", "hint"]) {
      if (key in sanitizedRecord && sanitizedRecord[key] !== undefined) {
        if (key === "message") details.message = typeof sanitizedRecord[key] === "string" ? sanitizedRecord[key] : String(sanitizedRecord[key]);
        else if (key === "stack") details.stack = typeof sanitizedRecord[key] === "string" ? sanitizedRecord[key] : String(sanitizedRecord[key]);
        else if (key === "name") details.name = typeof sanitizedRecord[key] === "string" ? sanitizedRecord[key] : String(sanitizedRecord[key]);
        else if (key === "code") details.code = typeof sanitizedRecord[key] === "string" || typeof sanitizedRecord[key] === "number" ? sanitizedRecord[key] : String(sanitizedRecord[key]);
        else if (key === "details") details.details = typeof sanitizedRecord[key] === "string" ? sanitizedRecord[key] : String(sanitizedRecord[key]);
        else if (key === "hint") details.hint = typeof sanitizedRecord[key] === "string" ? sanitizedRecord[key] : String(sanitizedRecord[key]);
      }
    }
  }

  return {
    name: details.name ?? "UnknownError",
    message: details.message ?? "Unexpected server error",
    stack: details.stack,
    code: details.code,
    details: details.details,
    hint: details.hint,
  };
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

async function findIdenticalCurrentImports(batches: MultiWeekBatch[]) {
  const importIdByWeek = new Map<string, string>();

  for (const batch of batches) {
    const { data: importRecord, error: importError } = await supabaseAdmin
      .from("imports")
      .select("id")
      .eq("week_id", batch.week.id)
      .eq("is_current", true)
      .eq("status", "imported")
      .maybeSingle();
    if (importError) throw importError;
    if (!importRecord) return null;

    const { data: rawRows, error: rawRowsError } = await supabaseAdmin
      .from("raw_import_rows")
      .select("row_number, source_record_id, raw_data")
      .eq("import_id", importRecord.id)
      .order("row_number", { ascending: true });
    if (rawRowsError) throw rawRowsError;
    if ((rawRows ?? []).length !== batch.rows.length) return null;

    const incoming = batch.rows.map((row, index) => ({
      row_number: batch.rowNumbers[index],
      source_record_id: row.id,
      raw_data: row,
    }));
    if (canonicalJson(rawRows) !== canonicalJson(incoming)) return null;
    importIdByWeek.set(batch.week.id, importRecord.id);
  }

  return importIdByWeek;
}

export async function POST(request: Request) {
  let createdImportId: string | null = null;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      console.error("[api/import] missing required environment variables", {
        hasUrl: Boolean(supabaseUrl),
        hasPublishableKey: Boolean(publishableKey),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });
      return NextResponse.json(
        {
          error:
            "Server is missing required Supabase environment variables for import",
        },
        { status: 500 },
      );
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      supabaseUrl,
      publishableKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      },
    );

    const currentUser = await getCurrentUserProfile(supabase);

    console.info("[api/import] phase=auth", {
      status: currentUser.status,
      role:
        currentUser.status === "authenticated"
          ? currentUser.profile.role
          : null,
    });

    if (currentUser.status === "unauthenticated") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    if (currentUser.status !== "authenticated") {
      return NextResponse.json(
        { error: "Account profile is not assigned" },
        { status: 403 },
      );
    }

    if (
      currentUser.profile.role !== "campus_manager" &&
      currentUser.profile.role !== "super_admin"
    ) {
      return NextResponse.json(
        { error: "Campus Manager authorization required" },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    console.info("[api/import] phase=university_resolution", {
      hasRequestedUniversityId: formData.has("university_id"),
      requestedUniversityId:
        typeof formData.get("university_id") === "string"
          ? formData.get("university_id")
          : null,
      role: currentUser.profile.role,
    });
    const requestedUniversityId = formData.get("university_id");
    const universityId =
      currentUser.profile.role === "super_admin"
        ? typeof requestedUniversityId === "string"
          ? requestedUniversityId.trim()
          : ""
        : currentUser.profile.university_id;
    if (!universityId) {
      return NextResponse.json(
        { error: "Select a university before importing" },
        { status: 403 },
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
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "CSV file is required" },
        { status: 400 },
      );
    }

    const originalFile = await file.arrayBuffer();
    // Decode from the same buffer — do not call file.text() after arrayBuffer()
    // (Node/undici FormData File streams can be consumed once).
    const csvText = new TextDecoder("utf-8").decode(originalFile);

    console.info("[api/import] phase=csv_parse", {
      fileName: file.name,
      byteLength: originalFile.byteLength,
      contentType: file.type || "text/csv",
    });

    const parsed = Papa.parse<CSVRow>(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      return NextResponse.json(
        {
          error: "CSV parsing failed",
          details: parsed.errors,
        },
        { status: 400 },
      );
    }

    const rows = parsed.data;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "CSV contains no rows" },
        { status: 400 },
      );
    }

    const requiredColumns = [
      "id",
      "start_time",
      "calculated_end_time",
      "belt_test_updated_at",
      "student_name",
      "email",
      "squad_number",
      "initial_belt_levels",
      "final_belt_levels",
    ];

    const headers = parsed.meta.fields ?? [];

    const missingColumns = requiredColumns.filter(
      (column) => !headers.includes(column),
    );

    if (missingColumns.length > 0) {
      return NextResponse.json(
        {
          error: "CSV is missing required columns",
          missingColumns,
          receivedColumns: headers,
        },
        { status: 400 },
      );
    }

    if (formData.get("provisionStudentsOnly") === "true") {
      const emails = new Set(
        rows
          .map((row) => row.email?.trim().toLowerCase())
          .filter((email): email is string => Boolean(email)),
      );
      const squadNumbers = [
        ...new Set(rows.map((row) => row.squad_number?.trim()).filter(Boolean)),
      ];
      const students = await findStudentsByNormalizedEmail(emails);
      const memberships = await loadMemberships(
        students.map((student) => student.id),
      );
      const { data: squads, error: squadsError } = squadNumbers.length
        ? await supabaseAdmin
            .from("squads")
            .select("id, squad_number, university_id")
            .eq("university_id", universityId)
            .in("squad_number", squadNumbers)
        : { data: [], error: null };

      if (squadsError) throw squadsError;

      const provisioning = await provisionDistinctStudentRows({
        rows,
        students,
        memberships,
        squads: squads ?? [],
        universityId,
        actorUserId: currentUser.user.id,
      });
      const rowResults = provisioning.rowResults;
      const errorRows = rowResults.filter((row) => row.errors.length > 0).length;
      const status = errorRows === 0 ? "provisioned" : "failed";

      await writeAuditLog(
        currentUser.user.id,
        "students_provisioned_from_csv",
        "university",
        universityId,
        {
          status,
          csv_row_count: rows.length,
          unique_student_count: rowResults.length,
          error_count: errorRows,
        },
      );

      // Students in this CSV get sign-in access with the student role.
      const access = await trySyncStudentAccess(rows.map((row) => row.email));

      return NextResponse.json({
        access,
        message: "Student provisioning completed",
        status,
        totalRows: rowResults.length,
        importedRows: rowResults.length - errorRows,
        errorRows,
        sourceRowCount: rows.length,
        rowResults,
      });
    }

    const multiWeekAction = formData.get("multiWeekAction");
    if (multiWeekAction === "preview" || multiWeekAction === "commit") {
      const academicYearValue = formData.get("academicYear");
      const academicYear = Number(academicYearValue);
      if (!Number.isInteger(academicYear) || academicYear < 2000) {
        return NextResponse.json(
          { error: "Valid academic year is required" },
          { status: 400 },
        );
      }
      console.info("[api/import] phase=week_resolution", {
        academicYear,
        rowCount: rows.length,
        universityId,
      });
      const prepared = await prepareMultiWeekImport(
        rows,
        universityId,
        academicYear,
      );
      const errorRows = new Set(
        prepared.errors.map((error) => error.row_number),
      ).size;
      const summary = {
        rows: rows.length,
        weeks: prepared.groups.length,
        squads: prepared.squadsProcessed,
        studentsCreated: prepared.studentsToCreate.length,
        existingStudents: prepared.existingStudents,
        membershipsCreated: prepared.membershipsToCreate.length,
        errors: errorRows,
      };

      if (multiWeekAction === "preview" || errorRows > 0) {
        return NextResponse.json({
          status: errorRows > 0 ? "invalid" : "preview",
          summary,
          weeks: prepared.groups,
          errors: prepared.errors.map((error) => {
            const week = prepared.weekByRow.get(error.row_number);
            return {
              ...error,
              week_id: week?.id ?? null,
              week_number: week?.week_number ?? null,
              academic_year: week?.academic_year ?? null,
              start_date: week?.start_date ?? null,
              end_date: week?.end_date ?? null,
            };
          }),
          rowResults: prepared.rowResults,
        });
      }

      const existingImports = await findIdenticalCurrentImports(prepared.batches);
      if (existingImports) {
        return NextResponse.json({
          status: "imported",
          message: "This CSV is already the current import; no duplicate records were created",
          summary: { ...summary, errors: 0 },
          weeks: prepared.groups.map((group) => ({
            ...group,
            import_id: existingImports.get(group.week_id) ?? null,
            imported: true,
          })),
          rowResults: prepared.rowResults.map((row) => ({
            ...row,
            belt_import_status: "imported",
          })),
        });
      }

      const batchId = crypto.randomUUID();
      const uploadedPaths: string[] = [];
      const weekBatches: Array<Record<string, unknown>> = [];
      let databaseCommitted = false;

      try {
        const sourceFilePath = [
          "universities",
          universityId,
          "date-derived-imports",
          batchId,
          sanitizeFileName(file.name),
        ].join("/");
        const { error: storageError } = await supabaseAdmin.storage
          .from("dojo-imports")
          .upload(sourceFilePath, originalFile, {
            contentType: file.type || "text/csv",
            upsert: true,
          });
        if (storageError) throw storageError;
        uploadedPaths.push(sourceFilePath);

        for (const batch of prepared.batches) {
          const importId = crypto.randomUUID();
          weekBatches.push({
            import_id: importId,
            date: batch.week.start_date,
            file_name: file.name,
            source_file_path: sourceFilePath,
            row_count: batch.rows.length,
            records: batch.records,
            raw_rows: batch.rows.map((row, index) => ({
              row_number: batch.rowNumbers[index],
              source_record_id: row.id,
              raw_data: row,
            })),
          });
        }

        const memberships = prepared.membershipsToCreate.map((membership) => ({
          student_id: prepared.studentIdByEmail.get(membership.email),
          squad_id: membership.squad_id,
          start_date: membership.start_date,
        }));
        if (memberships.some((membership) => !membership.student_id)) {
          throw new Error("Unable to resolve a student for a planned membership");
        }

        console.info("[api/import] phase=finalize_multiweek_import", {
          academicYear,
          universityId,
          weekCount: prepared.batches.length,
        });
        const { data: finalizedImports, error: finalizeError } =
          await supabaseAdmin.rpc("finalize_multiweek_import", {
            p_university_id: universityId,
            p_academic_year: academicYear,
            p_students: prepared.studentsToCreate,
            p_memberships: memberships,
            p_expected_weeks: prepared.expectedWeeks,
            p_new_weeks: prepared.newDateWeeks,
            p_week_number_updates: prepared.weekNumberUpdates,
            p_week_batches: weekBatches,
          });
        if (finalizeError) throw finalizeError;
        databaseCommitted = true;

        const finalizedByWeek = new Map(
          ((finalizedImports ?? []) as Array<{
            import_id: string;
            week_id: string;
            start_date: string;
            row_count: number;
          }>).map((result) => [result.start_date, result]),
        );
        try {
          for (const student of prepared.studentsToCreate) {
            await writeAuditLog(
              currentUser.user.id,
              "student_created",
              "student",
              student.id,
              { university_id: universityId, source: "belt_csv" },
            );
          }
          for (const membership of prepared.membershipsToCreate) {
            const studentId = prepared.studentIdByEmail.get(membership.email);
            if (!studentId) continue;
            await writeAuditLog(
              currentUser.user.id,
              "student_assignment",
              "student",
              studentId,
              {
                university_id: universityId,
                squad_id: membership.squad_id,
                source: "belt_csv",
              },
            );
          }
          for (const batch of prepared.batches) {
            const finalized = finalizedByWeek.get(batch.week.start_date);
            if (!finalized) continue;
            await writeAuditLog(
              currentUser.user.id,
              "import_completed",
              "import",
              finalized.import_id,
              {
                university_id: universityId,
                academic_year: batch.week.academic_year,
                week_number: batch.week.week_number,
                status: "imported",
                row_count: batch.rows.length,
                batch_id: batchId,
              },
            );
          }
        } catch (auditError) {
          console.error("[api/import] multi-week audit logging failed", auditError);
        }

        const access = await trySyncStudentAccess(rows.map((row) => row.email));

        return NextResponse.json({
          access,
          status: "imported",
          message: "Multi-week import completed",
          summary: { ...summary, errors: 0 },
          weeks: prepared.groups.map((group) => ({
            ...group,
            week_id: finalizedByWeek.get(group.start_date)?.week_id ?? group.week_id,
            import_id: finalizedByWeek.get(group.start_date)?.import_id ?? null,
            imported: true,
          })),
          rowResults: prepared.rowResults.map((row) => ({
            ...row,
            belt_import_status: "imported",
          })),
        });
      } catch (error) {
        if (!databaseCommitted && uploadedPaths.length > 0) {
          const { error: cleanupError } = await supabaseAdmin.storage
            .from("dojo-imports")
            .remove(uploadedPaths);
          if (cleanupError) {
            console.error("[api/import] source file cleanup failed", cleanupError);
          }
        }
        throw error;
      }
    }

    /*
     * Determine the week from the first row.
     *
     * The current source CSV does not contain week_number or
     * academic_year, so we derive the week from start_time.
     */
    console.info("[api/import] phase=week_creation", {
      academicYearValue: formData.get("academicYear"),
      weekNumberValue: formData.get("weekNumber"),
      universityId,
    });
    const weekNumberValue = formData.get("weekNumber");
    const academicYearValue = formData.get("academicYear");

    const weekNumber = Number(weekNumberValue);
    const academicYear = Number(academicYearValue);

    if (!Number.isInteger(weekNumber) || weekNumber < 1) {
      return NextResponse.json(
        { error: "Valid week number is required" },
        { status: 400 },
      );
    }

    if (!Number.isInteger(academicYear) || academicYear < 2000) {
      return NextResponse.json(
        { error: "Valid academic year is required" },
        { status: 400 },
      );
    }
    /*
     * Create/find the week.
     */
    const selectedWeekId = formData.get("weekId");
    const weekLookup =
      typeof selectedWeekId === "string" && selectedWeekId.trim()
        ? await supabaseAdmin
            .from("weeks")
            .select("*")
            .eq("id", selectedWeekId.trim())
            .eq("university_id", universityId)
            .maybeSingle()
        : await supabaseAdmin
            .from("weeks")
            .select("*")
            .eq("academic_year", academicYear)
            .eq("week_number", weekNumber)
            .eq("university_id", universityId)
            .maybeSingle();
    let week = weekLookup.data;
    const weekError = weekLookup.error;

    if (weekError) {
      throw weekError;
    }

    if (
      typeof selectedWeekId === "string" &&
      selectedWeekId.trim() &&
      week &&
      (week.academic_year !== academicYear || week.week_number !== weekNumber)
    ) {
      return NextResponse.json(
        { error: "Selected week does not match the academic year and week number" },
        { status: 400 },
      );
    }

    if (typeof selectedWeekId === "string" && selectedWeekId.trim() && !week) {
      return NextResponse.json(
        { error: "Selected week was not found for this university" },
        { status: 400 },
      );
    }

    if (!week) {
      const startDate = new Date(
        Date.UTC(academicYear, 0, 1 + (weekNumber - 1) * 7),
      );

      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 6);

      const result = await supabaseAdmin
        .from("weeks")
        .insert({
          university_id: universityId,
          week_number: weekNumber,
          academic_year: academicYear,
          start_date: startDate.toISOString().slice(0, 10),
          end_date: endDate.toISOString().slice(0, 10),
        })
        .select()
        .single();

      if (result.error) {
        throw result.error;
      }

      week = result.data;
    }

    /*
     * Create the import record.
     */
    const { data: importRecord, error: importError } = await supabaseAdmin
      .from("imports")
      .insert({
        week_id: week.id,
        file_name: file.name,
        status: "processing",
        row_count: rows.length,
        is_current: false,
      })
      .select()
      .single();

    if (importError) {
      throw importError;
    }
    createdImportId = importRecord.id;

    /*
     * Preserve every original CSV row.
     */
    const rawRows = rows.map((row, index) => ({
      import_id: importRecord.id,
      row_number: index + 2,
      source_record_id: row.id,
      raw_data: row,
    }));

    const { error: rawError } = await supabaseAdmin
      .from("raw_import_rows")
      .insert(rawRows);

    if (rawError) {
      await supabaseAdmin
        .from("imports")
        .update({ status: "failed" })
        .eq("id", importRecord.id);

      throw rawError;
    }

    const sourceFilePath = [
      "universities",
      universityId,
      "weeks",
      week.id,
      "imports",
      importRecord.id,
      sanitizeFileName(file.name),
    ].join("/");
    const { error: storageError } = await supabaseAdmin.storage
      .from("dojo-imports")
      .upload(sourceFilePath, originalFile, {
        contentType: file.type || "text/csv",
        upsert: true,
      });

    if (storageError) {
      console.error("[api/import] storage upload failed", {
        bucket: "dojo-imports",
        path: sourceFilePath,
        message: storageError.message,
        name: storageError.name,
      });
      throw storageError;
    }

    console.info("[api/import] storage upload ok", {
      bucket: "dojo-imports",
      path: sourceFilePath,
    });

    const { error: sourcePathError } = await supabaseAdmin
      .from("imports")
      .update({ source_file_path: sourceFilePath })
      .eq("id", importRecord.id);

    if (sourcePathError) {
      throw sourcePathError;
    }

    /*
     * Find all students by email.
     */
    const emails = new Set(
      rows.map((row) => row.email?.trim().toLowerCase()).filter(Boolean),
    );
    const squadNumbers = [
      ...new Set(rows.map((row) => row.squad_number?.trim()).filter(Boolean)),
    ];

    let students = await findStudentsByNormalizedEmail(emails);
    const studentIds = students.map((student) => student.id);
    let memberships = await loadMemberships(studentIds);

    const { data: squads, error: squadsError } = squadNumbers.length
      ? await supabaseAdmin
          .from("squads")
          .select("id, squad_number, university_id")
          .eq("university_id", universityId)
          .in("squad_number", squadNumbers)
      : { data: [], error: null };

    if (squadsError) throw squadsError;

    const preflight = validateImportRows({
      rows,
      students,
      memberships,
      squads: squads ?? [],
      weekByRow: new Map(rows.map((_, index) => [index + 2, week])),
      universityId,
      allowStudentProvisioning: true,
    });

    const rowOutcomes = new Map<number, ImportRowOutcome>();

    if (preflight.errors.length === 0) {
      const provisioning = await provisionDistinctStudentRows({
        rows,
        students,
        memberships,
        squads: squads ?? [],
        universityId,
        actorUserId: currentUser.user.id,
        membershipStartDate: week.start_date,
      });
      students = provisioning.students;
      for (const outcome of provisioning.rowResults) {
        rowOutcomes.set(outcome.row_number, outcome);
      }
      memberships = await loadMemberships(students.map((student) => student.id));
    }

    const validation = preflight.errors.length
      ? preflight
      : validateImportRows({
          rows,
          students,
          memberships,
          squads: squads ?? [],
          weekByRow: new Map(rows.map((_, index) => [index + 2, week])),
          universityId,
        });

    const importErrors = validation.errors.map((error) => ({
      import_id: importRecord.id,
      ...error,
    }));
    const records = validation.records.map((record) => ({
      ...record,
      week_id: week.id,
      import_id: importRecord.id,
    }));

    /*
     * Store validation errors.
     */
    if (importErrors.length > 0) {
      const { error: errorInsert } = await supabaseAdmin
        .from("import_errors")
        .insert(importErrors);

      if (errorInsert) {
        throw errorInsert;
      }
    }

    const status = importErrors.length === 0 ? "imported" : "failed";

    if (status === "imported") {
      console.info("[api/import] phase=finalize_import", {
        importId: importRecord.id,
        weekId: week.id,
        rowCount: records.length,
      });
      const { error: finalizeError } = await supabaseAdmin.rpc(
        "finalize_import",
        {
          p_import_id: importRecord.id,
          p_week_id: week.id,
          p_row_count: records.length,
          p_records: records,
        },
      );

      if (finalizeError) {
        console.error("[api/import] finalize_import failed", {
          importId: importRecord.id,
          weekId: week.id,
          message: finalizeError.message,
          code: finalizeError.code,
        });
        throw finalizeError;
      }

      console.info("[api/import] finalize_import ok", {
        importId: importRecord.id,
        rowCount: records.length,
      });
    } else {
      const { error: failedImportError } = await supabaseAdmin
        .from("imports")
        .update({
          status,
          row_count: rows.length,
        })
        .eq("id", importRecord.id);

      if (failedImportError) {
        throw failedImportError;
      }
    }

    await writeAuditLog(
      currentUser.user.id,
      "import_completed",
      "import",
      importRecord.id,
      {
        university_id: universityId,
        academic_year: academicYear,
        week_number: weekNumber,
        status,
        row_count: rows.length,
      },
    );

    const validationErrorsByRow = new Map<number, string[]>();
    for (const error of validation.errors) {
      validationErrorsByRow.set(error.row_number, [
        ...(validationErrorsByRow.get(error.row_number) ?? []),
        error.error_message,
      ]);
    }
    const rowResults: ImportRowOutcome[] = rows.map((row, index) => {
      const rowNumber = index + 2;
      const squadNumber = row.squad_number.trim();
      const student = students.find(
        (candidate) =>
          candidate.email.trim().toLowerCase() === row.email.trim().toLowerCase(),
      );
      const studentMemberships = memberships.filter(
        (membership) => membership.student_id === student?.id && !membership.end_date,
      );
      const activeMembership = studentMemberships[0];
      const activeSquad = activeMembership
        ? Array.isArray(activeMembership.squads)
          ? activeMembership.squads[0]
          : activeMembership.squads
        : null;
      const rowErrors = validationErrorsByRow.get(rowNumber) ?? [];
      const outcome = rowOutcomes.get(rowNumber);
      const squadExists = (squads ?? []).some(
        (candidate) => candidate.squad_number.trim() === squadNumber,
      );
      const membershipStatus = outcome?.membership_status ??
        (rowErrors.some((message) => message.startsWith("Squad ") && message.includes("does not exist"))
          ? "squad_not_found"
          : activeSquad?.id === (squads ?? []).find((candidate) => candidate.squad_number.trim() === squadNumber)?.id
            ? "already_in_squad"
            : activeSquad
              ? "another_squad"
              : squadExists
                ? "not_added"
                : "squad_not_found");

      return {
        row_number: rowNumber,
        student_name: row.student_name,
        squad_number: squadNumber,
        student_status: outcome?.student_status ?? (student ? "existing" : "not_created"),
        membership_status: membershipStatus,
        other_squad_number:
          outcome?.other_squad_number ??
          (membershipStatus === "another_squad" ? activeSquad?.squad_number ?? null : null),
        belt_import_status:
          status === "imported"
            ? "imported"
            : rowErrors.length > 0
              ? "validation_error"
              : "not_imported",
        errors: rowErrors,
      };
    });

    const access = await trySyncStudentAccess(rows.map((row) => row.email));

    return NextResponse.json({
      access,
      message: "Import completed",
      importId: importRecord.id,
      week: {
        id: week.id,
        weekNumber,
        academicYear,
      },
      totalRows: rows.length,
      importedRows: status === "imported" ? records.length : 0,
      errorRows: new Set(validation.errors.map((error) => error.row_number)).size,
      status,
      rowResults,
    });
  } catch (error) {
    if (createdImportId) {
      await supabaseAdmin
        .from("imports")
        .update({ status: "failed" })
        .eq("id", createdImportId)
        .eq("status", "processing");
    }

    const serializedError = serializeErrorDetails(error);
    console.error("[api/import] Import error:", {
      name: serializedError.name,
      message: serializedError.message,
      stack: serializedError.stack,
      code: serializedError.code,
      details: serializedError.details,
      hint: serializedError.hint,
      importId: createdImportId,
    });

    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Unexpected server error"
            : serializedError.message,
      },
      { status: 500 },
    );
  }
}
