import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/lib/import/validation.ts", import.meta.url),
  "utf8",
);
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const validation = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);
const weekUtilitySource = readFileSync(
  new URL("../src/lib/weeks.ts", import.meta.url),
  "utf8",
);
const weekUtilityJavaScript = ts.transpileModule(weekUtilitySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { formatWeekLabel } = await import(
  `data:text/javascript;base64,${Buffer.from(weekUtilityJavaScript).toString("base64")}`
);
const importRouteSource = readFileSync(
  new URL("../src/app/api/import/route.ts", import.meta.url),
  "utf8",
);
const serializeTarget = importRouteSource.slice(
  importRouteSource.indexOf("const SENSITIVE_LOG_FIELD_PATTERN"),
  importRouteSource.indexOf("function canonicalValue"),
);
const serializeJavaScript = ts.transpileModule(
  `${serializeTarget}\nexport { serializeErrorDetails };`,
  {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
const { serializeErrorDetails } = await import(
  `data:text/javascript;base64,${Buffer.from(serializeJavaScript).toString("base64")}`
);

const universityId = "st-joseph";
const dates = [
  "2025-11-28",
  "2026-02-13",
  "2026-02-19",
  "2026-03-27",
  "2026-04-10",
  "2026-05-15",
  "2026-07-24",
  "2026-07-31",
  "2026-08-07",
  "2026-08-14",
  "2026-08-28",
  "2026-09-11",
  "2026-09-18",
  "2026-09-25",
];
const squads = [138, 139, 183].map((number) => ({
  id: `squad-${number}`,
  squad_number: String(number),
  university_id: universityId,
}));
const finalLevels = JSON.stringify({ cpp: 0, java: 0, nodejs: 0, python: 0 });

function row({
  id = "source-1",
  email = "student@example.test",
  name = "Student Name",
  squad = 138,
  date = dates[0],
  initial = "{}",
  final = finalLevels,
  ...overrides
} = {}) {
  return {
    id,
    start_time: `${date}T08:30:00.000Z`,
    calculated_end_time: `${date}T09:30:00.000Z`,
    belt_test_updated_at: `${date}T09:40:00.000Z`,
    student_name: name,
    email,
    squad_number: String(squad),
    initial_belt_levels: initial,
    final_belt_levels: final,
    ...overrides,
  };
}

function resolve(rows, history = [], year = 2025) {
  return validation.resolveWeeksForRows(
    rows,
    history,
    universityId,
    year,
    (() => {
      let next = 0;
      return () => `planned-week-${++next}`;
    })(),
  );
}

function checkRows(rows, history = [], options = {}) {
  const resolution = resolve(rows, history, options.year ?? 2025);
  const students = options.students ?? [];
  const memberships = options.memberships ?? [];
  const availableSquads = options.squads ?? squads;
  const rowValidation = validation.validateImportRows({
    rows,
    students,
    memberships,
    squads: availableSquads,
    weekByRow: resolution.weekByRow,
    universityId,
    allowStudentProvisioning: true,
  });
  const plan = validation.planStudentProvisioning({
    rows,
    students,
    memberships,
    squads: availableSquads,
    universityId,
    createStudentId: (() => {
      let next = 0;
      return () => `new-student-${++next}`;
    })(),
  });
  return {
    resolution,
    rowValidation,
    plan,
    errors: [...resolution.errors, ...rowValidation.errors, ...plan.errors],
  };
}

function existingHistory(resolution, academicYear = 2025) {
  const uniqueWeeks = new Map();
  for (const week of resolution.weekByRow.values()) {
    uniqueWeeks.set(week.start_date, week);
  }
  return [...uniqueWeeks.values()].map((week) => ({
    ...week,
    academic_year: academicYear,
    start_date: week.start_date,
    end_date: week.end_date,
  }));
}

test("one date and one squad resolve to one date-derived week", () => {
  const result = checkRows([row()]);
  assert.equal(result.errors.length, 0);
  const week = result.resolution.weekByRow.get(2);
  assert.equal(week.week_number, 1);
  assert.equal(week.start_date, dates[0]);
  assert.equal(week.end_date, dates[0]);
});

test("one date across multiple squads still resolves to one week ID", () => {
  const rows = [
    row({ id: "a", email: "a@example.test", squad: 138, date: dates[10] }),
    row({ id: "b", email: "b@example.test", squad: 139, date: dates[10] }),
    row({ id: "c", email: "c@example.test", squad: 183, date: dates[10] }),
  ];
  const result = checkRows(rows);
  assert.equal(result.errors.length, 0);
  assert.equal(new Set(result.resolution.weekByRow.values().map((week) => week.id)).size, 1);
});

test("dates sort chronologically into academic course-week numbers across calendar years", () => {
  const rows = dates.map((date, index) => row({
    id: `source-${index}`,
    email: `student-${index}@example.test`,
    squad: [138, 139, 183][index % 3],
    date,
  }));
  const result = resolve(rows);
  assert.equal(result.errors.length, 0);
  const byDate = new Map([...result.weekByRow.values()].map((week) => [week.start_date, week]));
  assert.equal(byDate.size, 14);
  dates.forEach((date, index) => {
    assert.equal(byDate.get(date).week_number, index + 1);
    assert.equal(byDate.get(date).start_date, date);
    assert.equal(byDate.get(date).end_date, date);
  });
});

test("902 rows from 14 dates and three squads create exactly 14 weeks", () => {
  const rowsByDate = dates.map(() => []);
  for (let index = 0; index < 902; index += 1) {
    const dateIndex = Math.floor((index * dates.length) / 902);
    const dateRows = rowsByDate[dateIndex];
    const studentIndex = dateRows.length;
    dateRows.push(row({
      id: `source-${index}`,
      email: `student-${studentIndex}@example.test`,
      name: `Student ${studentIndex}`,
      squad: [138, 139, 183][studentIndex % 3],
      date: dates[dateIndex],
      initial: "{}",
    }));
  }
  const rows = rowsByDate.flat();
  const result = checkRows(rows);
  assert.equal(rows.length, 902);
  assert.equal(result.errors.length, 0);
  assert.equal(new Set(result.resolution.weekByRow.values().map((week) => week.id)).size, 14);
  assert.equal(new Set(rows.map((item) => item.squad_number)).size, 3);
  assert.equal(result.plan.studentsToCreate.length, 65);
});

test("same source IDs duplicated in the CSV are rejected", () => {
  const result = checkRows([
    row({ id: "same-id", email: "a@example.test", date: dates[0] }),
    row({ id: "same-id", email: "b@example.test", date: dates[1] }),
  ]);
  assert.ok(result.rowValidation.errors.some((error) => /Duplicate source ID/.test(error.error_message)));
});

test("same student repeated in the same date keeps the newest record and the student is reused across dates", () => {
  const sameDate = checkRows([
    row({ id: "older", email: "a@example.test", date: dates[0], start_time: "2025-11-28T07:30:00.000Z" }),
    row({ id: "newer", email: " A@example.test ", date: dates[0], start_time: "2025-11-28T08:15:00.000Z" }),
  ]);
  assert.equal(sameDate.rowValidation.errors.length, 0);
  assert.equal(sameDate.rowValidation.records.length, 1);
  assert.equal(sameDate.rowValidation.records[0].source_record_id, "newer");

  const acrossDates = checkRows([
    row({ id: "a", email: "a@example.test", date: dates[0] }),
    row({ id: "b", email: " A@example.test ", date: dates[1] }),
  ]);
  assert.equal(acrossDates.errors.length, 0);
  assert.equal(acrossDates.plan.studentsToCreate.length, 1);
  assert.equal(acrossDates.plan.membershipsToCreate.length, 1);
  assert.equal(acrossDates.rowValidation.records.length, 2);
});

test("same student same week keeps the newest record and ignores older duplicates", () => {
  const result = checkRows([
    row({ id: "older-record", email: "same-week@example.test", squad: 138, date: dates[8], start_time: "2026-08-07T07:30:00.000Z" }),
    row({ id: "newer-record", email: "same-week@example.test", squad: 138, date: dates[8], start_time: "2026-08-07T08:15:00.000Z" }),
  ]);
  assert.equal(result.rowValidation.errors.length, 0);
  assert.equal(result.rowValidation.records.length, 1);
  assert.equal(result.rowValidation.records[0].source_record_id, "newer-record");
});

test("same student same week with three timestamps keeps the newest record", () => {
  const result = checkRows([
    row({ id: "oldest-record", email: "three-times@example.test", squad: 138, date: dates[8], start_time: "2026-08-07T06:00:00.000Z" }),
    row({ id: "middle-record", email: "three-times@example.test", squad: 138, date: dates[8], start_time: "2026-08-07T07:00:00.000Z" }),
    row({ id: "latest-record", email: "three-times@example.test", squad: 138, date: dates[8], start_time: "2026-08-07T09:00:00.000Z" }),
  ]);
  assert.equal(result.rowValidation.errors.length, 0);
  assert.equal(result.rowValidation.records.length, 1);
  assert.equal(result.rowValidation.records[0].source_record_id, "latest-record");
});

test("same student across different weeks keeps both weekly records", () => {
  const result = checkRows([
    row({ id: "week-1", email: "cross-week@example.test", squad: 138, date: dates[8], start_time: "2026-08-07T07:30:00.000Z" }),
    row({ id: "week-2", email: "cross-week@example.test", squad: 138, date: dates[9], start_time: "2026-08-14T07:45:00.000Z" }),
  ]);
  assert.equal(result.rowValidation.errors.length, 0);
  assert.equal(result.rowValidation.records.length, 2);
  assert.deepEqual(
    result.rowValidation.records.map((record) => record.source_record_id).sort(),
    ["week-1", "week-2"],
  );
});

test("same student same week identical timestamp is treated as an ambiguous duplicate error", () => {
  const result = checkRows([
    row({ id: "same-time-a", email: "ambiguous@example.test", squad: 138, date: dates[8], start_time: "2026-08-07T08:15:00.000Z" }),
    row({ id: "same-time-b", email: "ambiguous@example.test", squad: 138, date: dates[8], start_time: "2026-08-07T08:15:00.000Z" }),
  ]);
  assert.ok(result.rowValidation.errors.some((error) => /Duplicate student/.test(error.error_message)));
  assert.equal(result.rowValidation.records.length, 0);
});

test("date-derived week validation accepts the row when the resolved date matches the week date", () => {
  const result = checkRows([
    row({
      id: "week-8-valid",
      email: "week-8-valid@example.test",
      squad: 138,
      date: "2026-07-31",
      start_time: "2026-07-31T07:30:00.000Z",
      calculated_end_time: "2026-07-31T08:30:00.000Z",
      belt_test_updated_at: "2026-07-31T08:40:00.000Z",
    }),
  ]);
  assert.equal(
    result.rowValidation.errors.filter((error) => error.error_message === "start_time is outside the resolved academic week").length,
    0,
  );
  assert.equal(result.rowValidation.records.length, 1);
  assert.equal(result.rowValidation.records[0].source_record_id, "week-8-valid");
});

test("different students same week are all retained", () => {
  const result = checkRows([
    row({ id: "student-a", email: "student-a@example.test", squad: 138, date: dates[8], start_time: "2026-08-07T07:30:00.000Z" }),
    row({ id: "student-b", email: "student-b@example.test", squad: 138, date: dates[8], start_time: "2026-08-07T08:30:00.000Z" }),
  ]);
  assert.equal(result.rowValidation.errors.length, 0);
  assert.equal(result.rowValidation.records.length, 2);
});

test("existing student already in the same squad does not duplicate membership", () => {
  const student = { id: "student-existing", name: "Student Name", email: "student@example.test" };
  const membership = {
    student_id: student.id,
    start_date: dates[0],
    end_date: null,
    squads: squads[0],
  };
  const result = checkRows([row()], [], { students: [student], memberships: [membership] });
  assert.equal(result.errors.length, 0);
  assert.equal(result.plan.studentsToCreate.length, 0);
  assert.equal(result.plan.membershipsToCreate.length, 0);
  assert.equal(result.plan.membershipStatusByEmail.get("student@example.test"), "already_in_squad");
});

test("active assignment to another squad and missing foreign squad are validation errors", () => {
  const student = { id: "student-existing", name: "Student Name", email: "student@example.test" };
  const membership = {
    student_id: student.id,
    start_date: dates[0],
    end_date: null,
    squads: squads[0],
  };
  const conflict = checkRows([row({ squad: 139 })], [], { students: [student], memberships: [membership] });
  assert.ok(conflict.errors.some((error) => /already assigned to squad 138/.test(error.error_message)));
  const missing = checkRows([row({ squad: 205 })]);
  assert.ok(missing.errors.some((error) => /Squad 205 does not exist in your university/.test(error.error_message)));
});

test("invalid timestamps are errors and never resolve to a week", () => {
  const invalid = row({ start_time: "not-a-date" });
  const resolution = resolve([invalid]);
  assert.equal(resolution.weekByRow.size, 0);
  const result = checkRows([invalid]);
  assert.ok(result.errors.some((error) => error.error_message === "Invalid start_time"));
});

test("initial belt JSON may be partial or empty and is preserved exactly", () => {
  for (const initial of ['{"cpp":0}', '{"python":1}', '{"java":0,"nodejs":0,"python":2}', "{}"]) {
    const student = { id: "student-existing", name: "Student Name", email: "student@example.test" };
    const membership = {
      student_id: student.id,
      start_date: dates[0],
      end_date: null,
      squads: squads[0],
    };
    const result = checkRows(
      [row({ initial, final: JSON.stringify({ cpp: 2, java: 2, nodejs: 2, python: 2 }) })],
      [],
      { students: [student], memberships: [membership] },
    );
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    const strict = validation.validateImportRows({
      rows: [row({ initial, final: JSON.stringify({ cpp: 2, java: 2, nodejs: 2, python: 2 }) })],
      students: [student],
      memberships: [membership],
      squads,
      weekByRow: result.resolution.weekByRow,
      universityId,
    });
    assert.deepEqual(strict.records[0].initial_belt_levels, JSON.parse(initial));
  }
  const invalidFinal = checkRows([row({ final: "{}" })]);
  assert.ok(invalidFinal.errors.some((error) => /final_belt_levels is missing cpp/.test(error.error_message)));
});

test("existing date weeks are reused; future dates append and historical backfills preserve IDs", () => {
  const firstUpload = resolve(dates.map((date, index) => row({
    id: `source-${index}`,
    email: `student-${index}@example.test`,
    date,
  })));
  const history = existingHistory(firstUpload, 2025);
  const reupload = resolve([row({ date: dates[10] }), row({ date: dates[13] })], history, 2025);
  assert.equal(reupload.newDateWeeks.length, 0);
  assert.equal(reupload.weekByRow.get(2).id, history.find((week) => week.start_date === dates[10]).id);

  const future = resolve([row({ date: "2026-10-02" })], history, 2025);
  assert.equal(future.weekByRow.get(2).week_number, 15);

  const backfill = resolve([row({ date: "2025-11-21" })], history, 2025);
  assert.equal(backfill.weekByRow.get(2).week_number, 1);
  assert.equal(backfill.weekNumberUpdates.length, 14);
  assert.equal(backfill.weekByRow.get(2).start_date, "2025-11-21");
});

test("date identity is scoped to the selected academic year", () => {
  const otherYearWeek = {
    id: "other-academic-year-week",
    university_id: universityId,
    academic_year: 2026,
    week_number: 1,
    start_date: dates[0],
    end_date: dates[0],
  };
  const result = resolve([row({ date: dates[0] })], [otherYearWeek], 2025);
  assert.equal(result.weekByRow.get(2).academic_year, 2025);
  assert.notEqual(result.weekByRow.get(2).id, otherYearWeek.id);
  assert.equal(result.weekByRow.get(2).week_number, 1);
});

test("full historical CSV aligns to an existing latest Week 14 date", () => {
  const latest = {
    id: "existing-week-14",
    university_id: universityId,
    academic_year: 2025,
    week_number: 14,
    start_date: dates[13],
    end_date: dates[13],
  };
  const rows = dates.map((date, index) =>
    row({
      id: `source-${index}`,
      email: `student-${index}@example.test`,
      date,
    }),
  );
  const resolution = resolve(rows, [latest], 2025);
  assert.equal(resolution.weekByRow.get(2).week_number, 1);
  assert.equal(resolution.weekByRow.get(15).week_number, 14);
  assert.equal(resolution.weekByRow.get(15).id, latest.id);
  assert.equal(resolution.newDateWeeks.length, 13);
});

test("legacy range rows are reported and never silently reused or deleted", () => {
  const legacy = {
    id: "legacy-week",
    university_id: universityId,
    academic_year: 2025,
    week_number: 1,
    start_date: "2025-11-24",
    end_date: "2025-11-30",
  };
  const result = checkRows([row()], [legacy]);
  assert.ok(result.resolution.errors.some((error) => /legacy date ranges/.test(error.error_message)));
  assert.equal(legacy.start_date, "2025-11-24");
  assert.equal(legacy.end_date, "2025-11-30");
});

test("error serialization preserves non-enumerable metadata and redacts secrets", () => {
  const error = new Error("duplicate key error");
  Object.defineProperties(error, {
    name: { value: "PostgrestError", enumerable: false },
    code: { value: "23505", enumerable: false },
    details: { value: "Key (week_id)=(...) already exists.", enumerable: false },
    hint: { value: "Review the week history before import.", enumerable: false },
    stack: { value: "Error: duplicate key error\n    at /api/import:1:1", enumerable: false },
    headers: { value: { authorization: "Bearer top-secret", cookie: "session=abc123" }, enumerable: false },
  });

  const logged = serializeErrorDetails(error);

  assert.equal(logged.name, "PostgrestError");
  assert.equal(logged.message, "duplicate key error");
  assert.match(logged.stack, /duplicate key error/);
  assert.equal(logged.code, "23505");
  assert.match(logged.details, /already exists/);
  assert.match(logged.hint, /Review the week history/);
  assert.doesNotMatch(JSON.stringify(logged), /top-secret|session=abc123|Bearer/i);
});

test("date-derived week labels show the exact single test date", () => {
  assert.equal(
    formatWeekLabel({
      week_number: 13,
      start_date: "2026-09-18",
      end_date: "2026-09-18",
    }),
    "Week 13 · Sep 18, 2026",
  );
});