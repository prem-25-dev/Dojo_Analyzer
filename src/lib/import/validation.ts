const LANGUAGES = ["cpp", "java", "nodejs", "python"] as const;
type Language = (typeof LANGUAGES)[number];

export type CSVRow = {
  id: string;
  start_time: string;
  calculated_end_time: string;
  belt_test_updated_at: string;
  student_name: string;
  email: string;
  squad_number: string;
  initial_belt_levels: string;
  final_belt_levels: string;
};

export type CSVRowEntry = {
  row: CSVRow;
  rowNumber: number;
};

export type ImportValidationError = {
  row_number: number;
  field_name: string;
  error_message: string;
  raw_value: string;
};

export type ValidatedRecord = {
  student_id: string;
  source_record_id: string;
  start_time: string;
  calculated_end_time: string;
  belt_test_updated_at: string;
  initial_belt_levels: Partial<Record<Language, number>>;
  final_belt_levels: Record<Language, number>;
};

type Student = { id: string; name: string | null; email: string };
type Membership = {
  student_id: string;
  start_date: string | null;
  end_date: string | null;
  squads: { id: string; squad_number: string; university_id: string } | Array<{ id: string; squad_number: string; university_id: string }> | null;
};
type Squad = { id: string; squad_number: string; university_id: string };
export type ImportWeek = {
  id: string;
  university_id: string;
  academic_year: number;
  week_number: number;
  start_date: string;
  end_date: string;
};

export type PlannedWeekNumberUpdate = {
  id: string;
  current_week_number: number;
  week_number: number;
};

export type PlannedDateWeek = {
  proposed_id: string;
  date: string;
  week_number: number;
};

type ValidationContext = {
  rows: CSVRow[];
  students: Student[];
  memberships: Membership[];
  squads: Squad[];
  weekByRow: Map<number, ImportWeek>;
  universityId: string;
  allowStudentProvisioning?: boolean;
};

export type StudentProvisioningPlan = {
  studentsToCreate: Array<{ id: string; name: string; email: string }>;
  membershipsToCreate: Array<{
    email: string;
    squad_id: string;
    start_date: string;
  }>;
  studentIdByEmail: Map<string, string>;
  studentStatusByEmail: Map<string, "created" | "existing">;
  membershipStatusByEmail: Map<string, "added" | "already_in_squad">;
  errors: ImportValidationError[];
};

function nested<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function parseTimestamp(value: string) {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveWeeksForRows(
  rows: CSVRow[],
  weeks: ImportWeek[],
  universityId: string,
  academicYear: number,
  createWeekId: () => string,
) {
  const weekByRow = new Map<number, ImportWeek>();
  const errors: ImportValidationError[] = [];
  const datesByRow = new Map<number, string>();
  const csvDates = new Set<string>();
  const scopedWeeks = weeks.filter(
    (week) =>
      week.university_id === universityId &&
      week.academic_year === academicYear,
  );

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const timestamp = parseTimestamp(row.start_time ?? "");
    if (!timestamp) return;
    const rowDate = timestamp.toISOString().slice(0, 10);
    datesByRow.set(rowNumber, rowDate);
    csvDates.add(rowDate);
  });

  const legacyWeeks = scopedWeeks.filter(
    (week) => week.start_date !== week.end_date,
  );
  if (legacyWeeks.length > 0) {
    const conflictDetails = legacyWeeks
      .map(
        (week) =>
          `Week ${week.week_number} (${week.start_date} to ${week.end_date})`,
      )
      .join(", ");
    for (const [rowNumber, date] of datesByRow) {
      addError(
        errors,
        rowNumber,
        "start_time",
        `Existing week history for academic year ${academicYear} contains legacy date ranges (${conflictDetails}); review/migrate these records before importing date-derived weeks.`,
        date,
      );
    }
  }

  const existingWeeksByDate = new Map<string, ImportWeek[]>();
  for (const week of scopedWeeks.filter(
    (candidate) => candidate.start_date === candidate.end_date,
  )) {
    const existing = existingWeeksByDate.get(week.start_date) ?? [];
    existing.push(week);
    existingWeeksByDate.set(week.start_date, existing);
  }

  const duplicateExistingDates = new Set<string>();
  for (const [date, existing] of existingWeeksByDate) {
    if (existing.length > 1) duplicateExistingDates.add(date);
  }
  const expectedWeeks = Array.from(existingWeeksByDate.values())
    .flat()
    .map((week) => ({
      id: week.id,
      date: week.start_date,
      week_number: week.week_number,
    }));

  const allDates = Array.from(
    new Set([...existingWeeksByDate.keys(), ...csvDates]),
  ).sort();
  const existingChronological = Array.from(existingWeeksByDate.values())
    .map((existing) => existing[0])
    .sort((left, right) => left.start_date.localeCompare(right.start_date));
  const dateIndexByDate = new Map(allDates.map((date, index) => [date, index]));
  const firstExisting = existingChronological[0];
  const baseOffset = firstExisting
    ? Math.max(
        0,
        firstExisting.week_number -
          (dateIndexByDate.get(firstExisting.start_date) ?? 0) -
          1,
      )
    : 0;
  const existingNumbersAreChronological = existingChronological.every(
    (week, index) =>
      index === 0 ||
      existingChronological[index - 1].week_number + 1 === week.week_number,
  );
  if (!existingNumbersAreChronological) {
    for (const [rowNumber, date] of datesByRow) {
      addError(
        errors,
        rowNumber,
        "start_time",
        `Existing date-derived weeks for academic year ${academicYear} are not numbered in chronological order; review week history before importing.`,
        date,
      );
    }
  }

  const weekNumberUpdates: PlannedWeekNumberUpdate[] = [];
  const newDateWeeks: PlannedDateWeek[] = [];
  for (const date of allDates) {
    const weekNumber = baseOffset + (dateIndexByDate.get(date) ?? 0) + 1;
    const existing = existingWeeksByDate.get(date) ?? [];
    if (existing.length > 1) {
      for (const [rowNumber, rowDate] of datesByRow) {
        if (rowDate === date) {
          addError(
            errors,
            rowNumber,
            "start_time",
            `Multiple date-derived weeks already exist for ${date}; week history requires review.`,
            date,
          );
        }
      }
    }
    if (weekNumber < 1) {
      for (const [rowNumber, rowDate] of datesByRow) {
        if (rowDate === date) {
          addError(
            errors,
            rowNumber,
            "start_time",
            `Unable to assign a positive Dojo week number to ${date} without renumbering conflicting history.`,
            date,
          );
        }
      }
      continue;
    }
    if (existing.length === 0) {
      newDateWeeks.push({
        proposed_id: createWeekId(),
        date,
        week_number: weekNumber,
      });
      continue;
    }
    const week = existing[0];
    if (week.week_number !== weekNumber) {
      weekNumberUpdates.push({
        id: week.id,
        current_week_number: week.week_number,
        week_number: weekNumber,
      });
    }
  }

  for (const [rowNumber, date] of datesByRow) {
    if (duplicateExistingDates.has(date)) continue;
    const existing = existingWeeksByDate.get(date)?.[0];
    const newWeek = newDateWeeks.find((candidate) => candidate.date === date);
    const weekNumber = baseOffset + (dateIndexByDate.get(date) ?? 0) + 1;
    if (weekNumber < 1 || (!existing && !newWeek)) continue;
    weekByRow.set(rowNumber, {
      id: existing?.id ?? newWeek!.proposed_id,
      university_id: universityId,
      academic_year: academicYear,
      week_number: weekNumber,
      start_date: date,
      end_date: date,
    });
  }

  return {
    weekByRow,
    datesByRow,
    expectedWeeks,
    weekNumberUpdates,
    newDateWeeks,
    errors,
  };
}

function parseBeltLevels(
  value: string,
  fieldName: string,
  requireAllLanguages = true,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { error: `Invalid ${fieldName} JSON` };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: `${fieldName} must be a JSON object` };
  }

  const keys = Object.keys(parsed);
  const unexpectedKey = keys.find((key) => !LANGUAGES.includes(key as Language));
  if (unexpectedKey) {
    return { error: `${fieldName} contains unsupported language ${unexpectedKey}` };
  }

  const missingLanguage = LANGUAGES.find(
    (language) => !Object.prototype.hasOwnProperty.call(parsed, language),
  );
  if (requireAllLanguages && missingLanguage) {
    return { error: `${fieldName} is missing ${missingLanguage}` };
  }

  const levels: Partial<Record<Language, number>> = {};
  for (const language of LANGUAGES) {
    if (!Object.prototype.hasOwnProperty.call(parsed, language)) continue;
    const level = (parsed as Record<string, unknown>)[language];
    if (typeof level !== "number" || !Number.isFinite(level) || !Number.isInteger(level) || level < 0) {
      return { error: `${fieldName} ${language} must be a non-negative integer` };
    }
    levels[language] = level;
  }

  return { levels };
}

function addError(errors: ImportValidationError[], rowNumber: number, fieldName: string, errorMessage: string, rawValue: unknown) {
  errors.push({
    row_number: rowNumber,
    field_name: fieldName,
    error_message: errorMessage,
    raw_value: typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue ?? ""),
  });
}

function normalizeRowEntries(rows: Array<CSVRow | CSVRowEntry>): CSVRowEntry[] {
  return rows.map((entry, index) => {
    if ("row" in entry) {
      return entry;
    }
    return { row: entry, rowNumber: index + 2 };
  });
}

export function deduplicateRowsByWeekAndEmail(
  rows: Array<CSVRow | CSVRowEntry>,
  weekByRow: Map<number, ImportWeek>,
): { rows: CSVRowEntry[]; errors: ImportValidationError[] } {
  const grouped = new Map<string, CSVRowEntry[]>();
  const errors: ImportValidationError[] = [];

  for (const { row, rowNumber } of normalizeRowEntries(rows)) {
    const email = normalizeEmail(row.email ?? "");
    if (!email) continue;
    const key = `${weekByRow.get(rowNumber)?.id ?? `unresolved:${rowNumber}`}:${email}`;
    const entries = grouped.get(key) ?? [];
    entries.push({ row, rowNumber });
    grouped.set(key, entries);
  }

  const selected = new Map<number, CSVRow>();
  for (const entries of grouped.values()) {
    if (entries.length <= 1) {
      for (const { row, rowNumber } of entries) selected.set(rowNumber, row);
      continue;
    }

    const timestamps = entries
      .map(({ row, rowNumber }) => ({
        row,
        rowNumber,
        time: parseTimestamp(row.start_time ?? ""),
      }))
      .filter((entry): entry is typeof entry & { time: Date } => entry.time !== null);

    if (timestamps.length === 0) {
      for (const { row, rowNumber } of entries) selected.set(rowNumber, row);
      continue;
    }

    const latestTimestamp = timestamps.reduce(
      (latest, candidate) => Math.max(latest, candidate.time.getTime()),
      timestamps[0].time.getTime(),
    );

    const latestEntries = timestamps.filter(
      (entry) => entry.time.getTime() === latestTimestamp,
    );

    if (latestEntries.length > 1) {
      for (const { rowNumber } of latestEntries) {
        addError(
          errors,
          rowNumber,
          "email",
          "Duplicate student in uploaded file",
          `${entries[0].row.email?.trim().toLowerCase() ?? ""}`,
        );
      }
      continue;
    }

    const latest = latestEntries[0];
    selected.set(latest.rowNumber, latest.row);
  }

  return {
    rows: Array.from(selected.entries())
      .sort(([rowNumberLeft], [rowNumberRight]) => rowNumberLeft - rowNumberRight)
      .map(([rowNumber, row]) => ({ row, rowNumber })),
    errors,
  };
}

function isMembershipValidForTimestamp(membership: Membership, timestamp: Date) {
  const start = membership.start_date ? new Date(`${membership.start_date}T00:00:00Z`) : null;
  const endExclusive = membership.end_date ? new Date(`${membership.end_date}T00:00:00Z`) : null;
  if (start && timestamp < start) return false;
  if (endExclusive) {
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    if (timestamp >= endExclusive) return false;
  }
  return true;
}

export function validateImportRows({ rows, students, memberships, squads, weekByRow, universityId, allowStudentProvisioning = false }: ValidationContext) {
  const errors: ImportValidationError[] = [];
  const records: ValidatedRecord[] = [];
  const rowEntries = normalizeRowEntries(rows);
  const deduplicated = deduplicateRowsByWeekAndEmail(rowEntries, weekByRow);
  errors.push(...deduplicated.errors);
  const rowsToValidate = deduplicated.rows;
  const studentByEmail = new Map(students.map((student) => [normalizeEmail(student.email), student]));
  const membershipsByStudent = new Map<string, Membership[]>();
  const squadsByNumber = new Map<string, Squad>();
  for (const squad of squads) {
    const squadNumber = squad.squad_number.trim();
    if (squad.university_id === universityId && !squadsByNumber.has(squadNumber)) {
      squadsByNumber.set(squadNumber, squad);
    }
  }
  const allIds = new Map<string, number[]>();

  rowEntries.forEach(({ row, rowNumber }) => {
    const sourceId = row.id?.trim() ?? "";
    if (sourceId) allIds.set(sourceId, [...(allIds.get(sourceId) ?? []), rowNumber]);
  });

  for (const [sourceId, rowNumbers] of allIds) {
    if (rowNumbers.length > 1) {
      for (const rowNumber of rowNumbers) addError(errors, rowNumber, "id", "Duplicate source ID in uploaded file", sourceId);
    }
  }

  for (const membership of memberships) {
    const studentMemberships = membershipsByStudent.get(membership.student_id) ?? [];
    studentMemberships.push(membership);
    membershipsByStudent.set(membership.student_id, studentMemberships);
  }

  rowsToValidate.forEach(({ row, rowNumber }) => {
    const sourceId = row.id?.trim() ?? "";
    const email = normalizeEmail(row.email ?? "");
    const squadNumber = row.squad_number?.trim() ?? "";
    const startTime = parseTimestamp(row.start_time ?? "");
    const endTime = parseTimestamp(row.calculated_end_time ?? "");
    const beltTestTime = parseTimestamp(row.belt_test_updated_at ?? "");
    const week = weekByRow.get(rowNumber);
    const initial = parseBeltLevels(
      row.initial_belt_levels ?? "",
      "initial_belt_levels",
      false,
    );
    const final = parseBeltLevels(row.final_belt_levels ?? "", "final_belt_levels");

    if (!sourceId) addError(errors, rowNumber, "id", "Source record ID is required", row.id);
    if (!email) addError(errors, rowNumber, "email", "Student email is required", row.email);
    if (!row.student_name?.trim()) addError(errors, rowNumber, "student_name", "Student name is required", row.student_name);
    if (!squadNumber) addError(errors, rowNumber, "squad_number", "Squad number is required", row.squad_number);
    if (!startTime) addError(errors, rowNumber, "start_time", "Invalid start_time", row.start_time);
    if (!endTime) addError(errors, rowNumber, "calculated_end_time", "Invalid calculated_end_time", row.calculated_end_time);
    if (!beltTestTime) addError(errors, rowNumber, "belt_test_updated_at", "Invalid belt_test_updated_at", row.belt_test_updated_at);
    if (startTime && endTime && endTime < startTime) addError(errors, rowNumber, "calculated_end_time", "calculated_end_time cannot be earlier than start_time", row.calculated_end_time);
    if (startTime && week) {
      const resolvedDate = startTime.toISOString().slice(0, 10);
      if (resolvedDate !== week.start_date) {
        addError(errors, rowNumber, "start_time", "start_time is outside the resolved academic week", row.start_time);
      }
    }

    const student = studentByEmail.get(email);
    if (!student) {
      if (!allowStudentProvisioning) {
        addError(errors, rowNumber, "email", "Student was not found or does not belong to this university", row.email);
      }
    } else {
      if (normalizeName(row.student_name ?? "") !== normalizeName(student.name ?? "")) {
        addError(errors, rowNumber, "student_name", "Student name does not match registered student", row.student_name);
      }
    }

    const squad = squadsByNumber.get(squadNumber);
    if (squadNumber && !squad) {
      addError(errors, rowNumber, "squad_number", `Squad ${squadNumber} does not exist in your university.`, row.squad_number);
    } else if (student && squad) {
      const studentMemberships = membershipsByStudent.get(student.id) ?? [];
      const activeMemberships = studentMemberships.filter((membership) => !membership.end_date);
      const conflictingMembership = activeMemberships.find((membership) => nested(membership.squads)?.id !== squad.id);
      if (conflictingMembership) {
        const conflictingSquad = nested(conflictingMembership.squads);
        addError(errors, rowNumber, "squad_number", `Student is already assigned to squad ${conflictingSquad?.squad_number ?? "another squad"}.`, row.squad_number);
      } else if (activeMemberships.length > 0 || !allowStudentProvisioning) {
        if (!startTime || !studentMemberships.some((membership) => {
          const membershipSquad = nested(membership.squads);
          return membershipSquad?.id === squad.id && isMembershipValidForTimestamp(membership, startTime);
        })) {
          addError(errors, rowNumber, "squad_number", "Student is not assigned to this squad for the selected week", row.squad_number);
        }
      }
    }

    if (initial.error) addError(errors, rowNumber, "initial_belt_levels", initial.error, row.initial_belt_levels);
    if (final.error) addError(errors, rowNumber, "final_belt_levels", final.error, row.final_belt_levels);
    if (initial.levels && final.levels) {
      for (const language of LANGUAGES) {
        const initialLevel = initial.levels[language];
        const finalLevel = final.levels[language];
        if (
          initialLevel !== undefined &&
          finalLevel !== undefined &&
          finalLevel < initialLevel
        ) {
          addError(errors, rowNumber, "final_belt_levels", `final ${language} belt cannot be lower than initial ${language} belt`, row.final_belt_levels);
        }
      }
    }

    if ((student || allowStudentProvisioning) && initial.levels && final.levels && startTime && endTime && beltTestTime && sourceId && squadNumber && !errors.some((error) => error.row_number === rowNumber)) {
      records.push({
        student_id: student?.id ?? "provisioned-student",
        source_record_id: sourceId,
        start_time: row.start_time,
        calculated_end_time: row.calculated_end_time,
        belt_test_updated_at: row.belt_test_updated_at,
        initial_belt_levels: initial.levels,
        final_belt_levels: final.levels as Record<Language, number>,
      });
    }
  });

  return { errors, records };
}

export function planStudentProvisioning({
  rows,
  students,
  memberships,
  squads,
  universityId,
  createStudentId,
}: {
  rows: Array<CSVRow | CSVRowEntry>;
  students: Student[];
  memberships: Membership[];
  squads: Squad[];
  universityId: string;
  createStudentId: () => string;
}): StudentProvisioningPlan {
  const errors: ImportValidationError[] = [];
  const studentsToCreate: StudentProvisioningPlan["studentsToCreate"] = [];
  const membershipsToCreate: StudentProvisioningPlan["membershipsToCreate"] = [];
  const studentIdByEmail = new Map<string, string>();
  const studentStatusByEmail = new Map<string, "created" | "existing">();
  const membershipStatusByEmail = new Map<string, "added" | "already_in_squad">();
  const studentsByEmail = new Map(
    students.map((student) => [normalizeEmail(student.email), student]),
  );
  const squadsByNumber = new Map(
    squads
      .filter((squad) => squad.university_id === universityId)
      .map((squad) => [squad.squad_number.trim(), squad]),
  );
  const rowsByEmail = new Map<string, Array<{ row: CSVRow; rowNumber: number }>>();

  for (const { row, rowNumber } of normalizeRowEntries(rows)) {
    const email = normalizeEmail(row.email ?? "");
    if (!email) continue;
    const entries = rowsByEmail.get(email) ?? [];
    entries.push({ row, rowNumber });
    rowsByEmail.set(email, entries);
  }

  for (const [email, entries] of rowsByEmail) {
    const firstName = normalizeName(entries[0].row.student_name ?? "");
    const firstSquadNumber = entries[0].row.squad_number?.trim() ?? "";
    const hasNameMismatch = entries.some(
      ({ row }) => normalizeName(row.student_name ?? "") !== firstName,
    );
    const hasSquadMismatch = entries.some(
      ({ row }) => row.squad_number?.trim() !== firstSquadNumber,
    );
    if (hasNameMismatch) {
      for (const { row, rowNumber } of entries) {
        addError(errors, rowNumber, "student_name", "Student name differs between rows for this email", row.student_name);
      }
      continue;
    }
    if (hasSquadMismatch) {
      for (const { row, rowNumber } of entries) {
        addError(errors, rowNumber, "squad_number", "Student is listed in multiple squads in the CSV", row.squad_number);
      }
      continue;
    }

    const squad = squadsByNumber.get(firstSquadNumber);
    if (!squad) continue;

    const existingStudent = studentsByEmail.get(email);
    const studentId = existingStudent?.id ?? createStudentId();
    studentIdByEmail.set(email, studentId);
    studentStatusByEmail.set(email, existingStudent ? "existing" : "created");

    const activeMemberships = existingStudent
      ? memberships.filter(
          (membership) =>
            membership.student_id === existingStudent.id && !membership.end_date,
        )
      : [];
    const currentSquad = activeMemberships
      .map((membership) => nested(membership.squads))
      .find((membershipSquad) => membershipSquad !== null);

    if (currentSquad && currentSquad.id !== squad.id) {
      for (const { row, rowNumber } of entries) {
        addError(
          errors,
          rowNumber,
          "squad_number",
          `${row.student_name.trim()} is already assigned to squad ${currentSquad.squad_number}.`,
          row.squad_number,
        );
      }
      continue;
    }

    if (activeMemberships.length > 1) {
      for (const { row, rowNumber } of entries) {
        addError(errors, rowNumber, "squad_number", "Student has multiple active squad memberships", row.squad_number);
      }
      continue;
    }

    if (!existingStudent) {
      studentsToCreate.push({
        id: studentId,
        name: entries[0].row.student_name.trim(),
        email,
      });
    }

    if (activeMemberships.length === 0) {
      const startDate = entries
        .map(({ row }) => parseTimestamp(row.start_time ?? ""))
        .filter((timestamp): timestamp is Date => timestamp !== null)
        .sort((left, right) => left.getTime() - right.getTime())[0]
        ?.toISOString()
        .slice(0, 10);
      if (startDate) {
        membershipsToCreate.push({
          email,
          squad_id: squad.id,
          start_date: startDate,
        });
        membershipStatusByEmail.set(email, "added");
      }
    } else {
      membershipStatusByEmail.set(email, "already_in_squad");
    }
  }

  return {
    studentsToCreate,
    membershipsToCreate,
    studentIdByEmail,
    studentStatusByEmail,
    membershipStatusByEmail,
    errors,
  };
}
