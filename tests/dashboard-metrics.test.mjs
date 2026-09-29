import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/lib/dashboard/metrics.ts", import.meta.url),
  "utf8",
);
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const metrics = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

// Levels are in [cpp, java, nodejs, python] order.
function fixture() {
  return {
    role: "super_admin",
    universityId: null,
    universities: [
      { id: "u1", name: "Alpha" },
      { id: "u2", name: "Beta" },
    ],
    academicYears: [2026],
    academicYear: 2026,
    weeks: [
      { id: "a1", university_id: "u1", week_number: 1, start_date: null, end_date: null },
      { id: "a2", university_id: "u1", week_number: 2, start_date: null, end_date: null },
      { id: "a3", university_id: "u1", week_number: 3, start_date: null, end_date: null },
      { id: "b1", university_id: "u2", week_number: 1, start_date: null, end_date: null },
    ],
    squads: [
      { id: "s1", squad_number: "101", university_id: "u1" },
      { id: "s2", squad_number: "101", university_id: "u2" },
    ],
    students: [
      { id: "ann", name: "Ann", squad_id: "s1" },
      { id: "ben", name: "Ben", squad_id: "s1" },
      { id: "cai", name: "Cai", squad_id: "s1" },
      { id: "dev", name: "Dev", squad_id: "s2" },
    ],
    records: [
      { s: "ann", w: "a1", l: [0, 0, 0, 1] },
      { s: "ann", w: "a2", l: [0, 1, 0, 2] },
      { s: "ann", w: "a3", l: [0, 1, 0, 3] },
      { s: "ben", w: "a1", l: [0, 0, 0, 2] },
      { s: "ben", w: "a2", l: [0, 0, 0, 2] },
      { s: "ben", w: "a3", l: [0, 0, 0, 1] },
      { s: "cai", w: "a3", l: [1, 0, 0, 0] },
      { s: "dev", w: "b1", l: [0, 0, 1, 0] },
    ],
    latestImport: null,
  };
}

test("labels squads with their university when several universities are in scope", () => {
  const model = metrics.buildModel(fixture());
  assert.equal(model.multiUniversity, true);
  assert.equal(model.squadLabel.get("s1"), "Alpha · Squad 101");
  assert.deepEqual(model.weekNumbers, [1, 2, 3]);
});

test("snapshot counts tested students, coverage and belts for a week", () => {
  const model = metrics.buildModel(fixture());
  const shot = metrics.snapshot(model, 3);
  assert.equal(shot.students, 4);
  assert.equal(shot.tested, 3);
  assert.equal(shot.coverage, 0.75);
  assert.equal(shot.totalBelts, 4 + 1 + 1);
  assert.deepEqual(shot.languageTotals, [1, 1, 0, 4]);
  assert.equal(metrics.snapshot(model, 1, "university", "u2").tested, 1);
});

test("movement compares each student with their previous recorded week", () => {
  const model = metrics.buildModel(fixture());
  const week3 = metrics.movement(model, 3);
  assert.equal(week3.up, 1); // ann 3 -> 4
  assert.equal(week3.down, 1); // ben 2 -> 1
  assert.equal(week3.first, 1); // cai's first record
  assert.equal(week3.untested, 1); // dev has no week 3
  assert.equal(week3.beltsGained, 0);
});

test("trend returns one row per week and one value per group", () => {
  const model = metrics.buildModel(fixture());
  const { groups, rows } = metrics.trend(model, "coverage", "university");
  assert.deepEqual(groups.map((group) => group.key), ["u1", "u2"]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].u1, (2 / 3) * 100);
  assert.equal(rows[0].u2, 100);
  assert.equal(rows[1].u2, 0);
});

test("level distribution fills every level up to the maximum", () => {
  const model = metrics.buildModel(fixture());
  assert.deepEqual(metrics.levelDistribution(model, 3, "python"), [
    { level: 0, students: 1 },
    { level: 1, students: 1 },
    { level: 2, students: 0 },
    { level: 3, students: 1 },
  ]);
});

test("stalled students need three recorded weeks with no gain", () => {
  const model = metrics.buildModel(fixture());
  assert.deepEqual(metrics.stalledStudents(model, 3), ["ben"]);
});

test("strongest language ignores all-zero groups", () => {
  const model = metrics.buildModel(fixture());
  assert.equal(metrics.strongestLanguage(metrics.snapshot(model, 3)), "python");
  assert.equal(metrics.strongestLanguage(metrics.snapshot(model, 2, "squad", "s2")), null);
});

test("ignores weeks from universities without squads and resolves week records", () => {
  const data = fixture();
  data.squads = data.squads.filter((squad) => squad.university_id === "u1");
  data.students = data.students.filter((student) => student.squad_id === "s1");
  data.weeks.push({ id: "c9", university_id: "u3", week_number: 9, start_date: null, end_date: null });
  data.weeks.unshift({ id: "b0", university_id: "u2", week_number: 3, start_date: null, end_date: null });
  const model = metrics.buildModel(data);
  assert.deepEqual(model.weekNumbers, [1, 2, 3]);
  assert.equal(model.primaryUniversityId, "u1");
  assert.equal(metrics.weekInfo(model, 3).id, "a3");
  assert.equal(metrics.weekInfo(metrics.buildModel(fixture()), 3), null);
});

test("range progress measures each student from their baseline to the end week", () => {
  const model = metrics.buildModel(fixture());
  const range = metrics.rangeProgress(model, 1, 3);
  const ann = range.students.find((student) => student.studentId === "ann");
  assert.equal(ann.gain, 3); // 1 -> 4
  assert.deepEqual(ann.languageGain, [0, 1, 0, 2]);
  assert.equal(ann.tests, 3);
  const ben = range.students.find((student) => student.studentId === "ben");
  assert.equal(ben.status, "dropped");
  const cai = range.students.find((student) => student.studentId === "cai");
  assert.equal(cai.joinedInRange, true); // first test is week 3
  assert.equal(cai.gain, 0);
  assert.equal(range.improved, 1);
  assert.equal(range.dropped, 1);
  assert.equal(range.beltsGained, 3 - 1 + 0 + 0);
});

test("range progress marks students without tests in the range as untested", () => {
  const model = metrics.buildModel(fixture());
  const range = metrics.rangeProgress(model, 2, 3, "university", "u2");
  assert.equal(range.students[0].status, "untested"); // dev only has week 1
  assert.equal(range.tested, 0);
  assert.equal(range.avgGain, null);
});
