import type { Language } from "@/lib/dashboard/metrics";

/** One leaderboard row, shared by the overall and language leaderboards. */
export type RankedStudent = {
  rank: number;
  studentId: string;
  name: string;
  squad: string | null;
  university: string | null;
  score: number;
  change: number;
  /** Per-language belts (overall leaderboard only). */
  languages?: Record<Language, number>;
};
