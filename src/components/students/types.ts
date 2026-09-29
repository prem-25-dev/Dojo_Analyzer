export type Squad = {
  id: string;
  squad_number: string;
  university_id?: string;
  university_name?: string | null;
};

export type University = { id: string; name: string };

export type Student = {
  id: string;
  name: string | null;
  email: string | null;
  squad_id: string | null;
  squad_number: string | null;
  university_name?: string | null;
  start_date: string | null;
  end_date: string | null;
};

export type WeekStudent = {
  student_id: string;
  squad_number: string | null;
  has_weekly_data: boolean;
  final_belt_levels: Record<string, number>;
};

export type StudentFormValues = {
  name: string;
  email: string;
  squadId: string;
};

export function initials(name: string | null) {
  const parts = (name ?? "").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Stable hue per string, so a student's avatar keeps its colour. */
export function hueOf(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export function beltTotal(levels: Record<string, number> | null | undefined) {
  return Object.values(levels ?? {}).reduce(
    (total, level) => total + (Number.isFinite(level) ? level : 0),
    0,
  );
}

export async function submitJson(
  url: string,
  method: "POST" | "PATCH",
  body: Record<string, string>,
) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(result.error ?? "The request could not be completed.");
  }
}
