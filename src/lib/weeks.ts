export type WeekDateRange = {
  week_number: number | null;
  start_date: string | null;
  end_date: string | null;
};

function parseDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function formatMonthDay(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatMonthDayYear(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatWeekDateRange(
  startDate: string | null,
  endDate: string | null,
) {
  if (!startDate || !endDate) return "Dates unavailable";

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Dates unavailable";
  }

  if (start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)) {
    return formatMonthDayYear(start);
  }

  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${formatMonthDayYear(start)} – ${formatMonthDayYear(end)}`;
  }

  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${formatMonthDay(start)} – ${formatMonthDayYear(end)}`;
  }

  return `${formatMonthDay(start)} – ${formatMonthDayYear(end)}`;
}

export function formatWeekLabel(week: WeekDateRange) {
  return `Week ${week.week_number ?? "—"} · ${formatWeekDateRange(week.start_date, week.end_date)}`;
}