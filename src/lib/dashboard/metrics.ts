// Pure dashboard aggregations. No runtime imports so tests can transpile this
// file on its own. All metrics use final belt levels from current imports, and
// "change" means the difference from a student's previous recorded week — the
// same convention as the weekly comparison page.

export const LANGUAGES = ["cpp", "java", "nodejs", "python"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  cpp: "C++",
  java: "Java",
  nodejs: "Node.js",
  python: "Python",
};

// ─── API payload ──────────────────────────────────────────────────────────────
export type DashboardData = {
  role: "super_admin" | "campus_manager" | "mentor" | "student";
  universityId: string | null;
  universities: Array<{ id: string; name: string }>;
  academicYears: number[];
  academicYear: number | null;
  weeks: Array<{
    id: string;
    university_id: string;
    week_number: number;
    start_date: string | null;
    end_date: string | null;
  }>;
  squads: Array<{ id: string; squad_number: string; university_id: string }>;
  students: Array<{ id: string; name: string; squad_id: string }>;
  /** s = student id, w = week id, l = final levels in LANGUAGES order */
  records: Array<{ s: string; w: string; l: number[] }>;
  latestImport: {
    file_name: string;
    uploaded_at: string;
    week_number: number | null;
  } | null;
};

// ─── Model ────────────────────────────────────────────────────────────────────
export type Group = { key: string; label: string };
export type GroupBy = "overall" | "language" | "squad" | "university";

export type Model = {
  data: DashboardData;
  weekNumbers: number[];
  multiUniversity: boolean;
  /** The one university with squads, when there is exactly one. */
  primaryUniversityId: string | null;
  squadLabel: Map<string, string>;
  squadUniversity: Map<string, string>;
  studentSquad: Map<string, string>;
  studentName: Map<string, string>;
  /** student id -> week number -> levels */
  levels: Map<string, Map<number, number[]>>;
};

export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function buildModel(data: DashboardData): Model {
  const weekNumberById = new Map(
    data.weeks.map((week) => [week.id, week.week_number]),
  );
  const universityName = new Map(
    data.universities.map((university) => [university.id, university.name]),
  );
  const squadUniversities = new Set(
    data.squads.map((squad) => squad.university_id),
  );
  const multiUniversity = squadUniversities.size > 1;
  const primaryUniversityId =
    squadUniversities.size === 1 ? [...squadUniversities][0] : null;

  const squadLabel = new Map<string, string>();
  const squadUniversity = new Map<string, string>();
  for (const squad of data.squads) {
    squadUniversity.set(squad.id, squad.university_id);
    const name = `Squad ${squad.squad_number}`;
    squadLabel.set(
      squad.id,
      multiUniversity
        ? `${universityName.get(squad.university_id) ?? "Unknown"} · ${name}`
        : name,
    );
  }

  const levels = new Map<string, Map<number, number[]>>();
  for (const record of data.records) {
    const weekNumber = weekNumberById.get(record.w);
    if (weekNumber === undefined) continue;
    const byWeek = levels.get(record.s) ?? new Map<number, number[]>();
    byWeek.set(weekNumber, record.l);
    levels.set(record.s, byWeek);
  }

  return {
    data,
    // Weeks from universities without squads have no students to report on.
    weekNumbers: [
      ...new Set(
        data.weeks
          .filter((week) => squadUniversities.has(week.university_id))
          .map((week) => week.week_number),
      ),
    ].sort((a, b) => a - b),
    multiUniversity,
    primaryUniversityId,
    squadLabel,
    squadUniversity,
    studentSquad: new Map(data.students.map((s) => [s.id, s.squad_id])),
    studentName: new Map(data.students.map((s) => [s.id, s.name])),
    levels,
  };
}

/** The week record for a week number, when weeks belong to one university. */
export function weekInfo(model: Model, week: number | null) {
  if (week === null || model.multiUniversity) return null;
  return (
    model.data.weeks.find(
      (item) =>
        item.week_number === week &&
        (!model.primaryUniversityId ||
          item.university_id === model.primaryUniversityId),
    ) ?? null
  );
}

export function previousWeek(model: Model, week: number) {
  const index = model.weekNumbers.indexOf(week);
  return index > 0 ? model.weekNumbers[index - 1] : null;
}

/** A student's most recent record strictly before `week`. */
function priorLevels(model: Model, studentId: string, week: number) {
  const byWeek = model.levels.get(studentId);
  if (!byWeek) return null;
  let best: number | null = null;
  for (const recorded of byWeek.keys()) {
    if (recorded < week && (best === null || recorded > best)) best = recorded;
  }
  return best === null ? null : (byWeek.get(best) ?? null);
}

export function groupsFor(model: Model, groupBy: GroupBy): Group[] {
  if (groupBy === "overall") return [{ key: "all", label: "All students" }];
  if (groupBy === "language")
    return LANGUAGES.map((language) => ({
      key: language,
      label: LANGUAGE_LABELS[language],
    }));
  if (groupBy === "squad")
    return model.data.squads
      .filter((squad) =>
        model.data.students.some((student) => student.squad_id === squad.id),
      )
      .map((squad) => ({
        key: squad.id,
        label: model.squadLabel.get(squad.id) ?? squad.squad_number,
      }));
  return model.data.universities
    .filter((university) =>
      model.data.squads.some((squad) => squad.university_id === university.id),
    )
    .map((university) => ({ key: university.id, label: university.name }));
}

function studentInGroup(
  model: Model,
  studentId: string,
  groupBy: GroupBy,
  key: string,
) {
  if (groupBy === "overall" || groupBy === "language") return true;
  const squadId = model.studentSquad.get(studentId);
  if (groupBy === "squad") return squadId === key;
  return squadId !== undefined && model.squadUniversity.get(squadId) === key;
}

function studentsIn(model: Model, groupBy: GroupBy, key: string) {
  return model.data.students.filter((student) =>
    studentInGroup(model, student.id, groupBy, key),
  );
}

// ─── Snapshot of one week for one group ───────────────────────────────────────
export type Snapshot = {
  students: number;
  tested: number;
  coverage: number | null;
  totalBelts: number;
  avgBelts: number | null;
  languageTotals: number[];
};

export function snapshot(
  model: Model,
  week: number,
  groupBy: GroupBy = "overall",
  key = "all",
): Snapshot {
  const members = studentsIn(model, groupBy, key);
  const languageTotals = LANGUAGES.map(() => 0);
  let tested = 0;
  for (const student of members) {
    const levels = model.levels.get(student.id)?.get(week);
    if (!levels) continue;
    tested += 1;
    levels.forEach((level, index) => (languageTotals[index] += level));
  }
  const totalBelts = sum(languageTotals);
  return {
    students: members.length,
    tested,
    coverage: members.length ? tested / members.length : null,
    totalBelts,
    avgBelts: tested ? totalBelts / tested : null,
    languageTotals,
  };
}

// ─── Movement vs previous record ──────────────────────────────────────────────
export type Movement = {
  up: number;
  same: number;
  down: number;
  first: number;
  untested: number;
  beltsGained: number;
  changes: Array<{ studentId: string; change: number; total: number }>;
};

export function movement(
  model: Model,
  week: number,
  groupBy: GroupBy = "overall",
  key = "all",
): Movement {
  const result: Movement = {
    up: 0,
    same: 0,
    down: 0,
    first: 0,
    untested: 0,
    beltsGained: 0,
    changes: [],
  };
  for (const student of studentsIn(model, groupBy, key)) {
    const current = model.levels.get(student.id)?.get(week);
    if (!current) {
      result.untested += 1;
      continue;
    }
    const prior = priorLevels(model, student.id, week);
    if (!prior) {
      result.first += 1;
      continue;
    }
    const change = sum(current) - sum(prior);
    result.changes.push({ studentId: student.id, change, total: sum(current) });
    result.beltsGained += change;
    if (change > 0) result.up += 1;
    else if (change < 0) result.down += 1;
    else result.same += 1;
  }
  return result;
}

// ─── Chart datasets ───────────────────────────────────────────────────────────
export type TrendMetric = "avgBelts" | "totalBelts" | "coverage";

/** One row per week; one column per group. */
export function trend(
  model: Model,
  metric: TrendMetric,
  groupBy: GroupBy,
): { groups: Group[]; rows: Array<Record<string, number | null>> } {
  const groups = groupsFor(model, groupBy);
  const rows = model.weekNumbers.map((week) => {
    const row: Record<string, number | null> = { week };
    for (const group of groups) {
      if (groupBy === "language") {
        const overall = snapshot(model, week);
        const index = LANGUAGES.indexOf(group.key as Language);
        const total = overall.languageTotals[index];
        row[group.key] =
          metric === "totalBelts"
            ? total
            : overall.tested
              ? total / overall.tested
              : null;
        continue;
      }
      const shot = snapshot(model, week, groupBy, group.key);
      row[group.key] =
        metric === "coverage"
          ? shot.coverage === null
            ? null
            : shot.coverage * 100
          : metric === "totalBelts"
            ? shot.totalBelts
            : shot.avgBelts;
    }
    return row;
  });
  return { groups, rows };
}

/** Students per belt level in a week, for one language or all-language total. */
export function levelDistribution(
  model: Model,
  week: number,
  language: Language | "all",
) {
  const counts = new Map<number, number>();
  for (const student of model.data.students) {
    const levels = model.levels.get(student.id)?.get(week);
    if (!levels) continue;
    const value =
      language === "all" ? sum(levels) : levels[LANGUAGES.indexOf(language)];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const max = Math.max(0, ...counts.keys());
  return Array.from({ length: max + 1 }, (_, level) => ({
    level,
    students: counts.get(level) ?? 0,
  }));
}

/** Belts held in a week, split by language, squad or university. */
export function beltShare(
  model: Model,
  week: number,
  splitBy: Exclude<GroupBy, "overall">,
) {
  if (splitBy === "language") {
    const shot = snapshot(model, week);
    return LANGUAGES.map((language, index) => ({
      key: language,
      label: LANGUAGE_LABELS[language],
      value: shot.languageTotals[index],
    }));
  }
  return groupsFor(model, splitBy).map((group) => ({
    key: group.key,
    label: group.label,
    value: snapshot(model, week, splitBy, group.key).totalBelts,
  }));
}

/** Average belts per tested student in each group, split by language. */
export function groupComparison(
  model: Model,
  week: number,
  groupBy: "squad" | "university",
) {
  return groupsFor(model, groupBy).map((group) => {
    const shot = snapshot(model, week, groupBy, group.key);
    const row: Record<string, string | number | null> = {
      key: group.key,
      label: group.label,
      tested: shot.tested,
      students: shot.students,
      coverage: shot.coverage === null ? null : shot.coverage * 100,
    };
    LANGUAGES.forEach((language, index) => {
      row[language] = shot.tested
        ? shot.languageTotals[index] / shot.tested
        : 0;
    });
    return row;
  });
}

// ─── Attention signals ────────────────────────────────────────────────────────
/** Students whose last `span` recorded weeks (up to `week`) show no belt gain. */
export function stalledStudents(model: Model, week: number, span = 3) {
  const stalled: string[] = [];
  for (const student of model.data.students) {
    const byWeek = model.levels.get(student.id);
    if (!byWeek) continue;
    const recorded = [...byWeek.keys()]
      .filter((recordedWeek) => recordedWeek <= week)
      .sort((a, b) => a - b)
      .slice(-span);
    if (recorded.length < span || recorded.at(-1) !== week) continue;
    const totals = recorded.map((recordedWeek) =>
      sum(byWeek.get(recordedWeek) ?? []),
    );
    if (totals.every((total) => total <= totals[0])) stalled.push(student.id);
  }
  return stalled;
}

export function lowCoverageSquads(model: Model, week: number, threshold = 0.5) {
  return groupsFor(model, "squad")
    .map((group) => ({
      ...group,
      ...snapshot(model, week, "squad", group.key),
    }))
    .filter((row) => row.coverage !== null && row.coverage < threshold);
}

/** Language with the highest average level in a group, or null if all zero. */
export function strongestLanguage(shot: Snapshot): Language | null {
  let best: Language | null = null;
  let bestValue = 0;
  LANGUAGES.forEach((language, index) => {
    if (shot.languageTotals[index] > bestValue) {
      best = language;
      bestValue = shot.languageTotals[index];
    }
  });
  return best;
}

// ─── Progress across a week range ─────────────────────────────────────────────
export type RangeStatus =
  "improved" | "same" | "dropped" | "untested" | "no_data";

export type StudentRange = {
  studentId: string;
  name: string;
  squadId: string;
  /** Week the baseline was taken from (at or before `from`), if any. */
  startWeek: number | null;
  endWeek: number | null;
  start: number[] | null;
  end: number[] | null;
  gain: number;
  languageGain: number[];
  /** Belt tests recorded inside the range. */
  tests: number;
  /** No record at or before `from`, so the baseline is their first test in range. */
  joinedInRange: boolean;
  status: RangeStatus;
};

export type RangeSummary = {
  students: StudentRange[];
  improved: number;
  same: number;
  dropped: number;
  untested: number;
  beltsGained: number;
  languageGain: number[];
  avgGain: number | null;
  tested: number;
};

/**
 * Belts gained between two weeks. The baseline is each student's latest record
 * at or before `from` (or their first record inside the range if they have
 * none earlier); the end is their latest record at or before `to`.
 */
export function rangeProgress(
  model: Model,
  from: number,
  to: number,
  groupBy: GroupBy = "overall",
  key = "all",
): RangeSummary {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const summary: RangeSummary = {
    students: [],
    improved: 0,
    same: 0,
    dropped: 0,
    untested: 0,
    beltsGained: 0,
    languageGain: LANGUAGES.map(() => 0),
    avgGain: null,
    tested: 0,
  };

  for (const student of studentsIn(model, groupBy, key)) {
    const byWeek = model.levels.get(student.id) ?? new Map<number, number[]>();
    const weeks = [...byWeek.keys()].sort((a, b) => a - b);
    const inRange = weeks.filter((week) => week >= low && week <= high);
    const before = weeks.filter((week) => week <= low);
    const startWeek = before.at(-1) ?? inRange[0] ?? null;
    const endWeek = weeks.filter((week) => week <= high).at(-1) ?? null;
    const start = startWeek === null ? null : (byWeek.get(startWeek) ?? null);
    const end = endWeek === null ? null : (byWeek.get(endWeek) ?? null);
    const languageGain =
      start && end
        ? end.map((level, index) => level - start[index])
        : LANGUAGES.map(() => 0);
    const gain = sum(languageGain);
    const tests = inRange.length;

    let status: RangeStatus;
    if (!end) status = "no_data";
    else if (inRange.length === 0) status = "untested";
    else if (gain > 0) status = "improved";
    else if (gain < 0) status = "dropped";
    else status = "same";

    summary.students.push({
      studentId: student.id,
      name: student.name,
      squadId: student.squad_id,
      startWeek,
      endWeek,
      start,
      end,
      gain,
      languageGain,
      tests,
      joinedInRange: before.length === 0 && inRange.length > 0,
      status,
    });

    if (status === "improved") summary.improved += 1;
    else if (status === "dropped") summary.dropped += 1;
    else if (status === "same") summary.same += 1;
    else summary.untested += 1;

    if (status !== "untested" && status !== "no_data") {
      summary.tested += 1;
      summary.beltsGained += gain;
      languageGain.forEach(
        (value, index) => (summary.languageGain[index] += value),
      );
    }
  }

  summary.avgGain = summary.tested
    ? summary.beltsGained / summary.tested
    : null;
  return summary;
}
