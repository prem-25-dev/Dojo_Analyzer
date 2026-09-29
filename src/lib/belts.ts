/**
 * Kalvium Dojo belt ladder (level → belt). Level 0 is White; senior belts
 * carry black stripes over their base colour.
 */
export type Belt = {
  name: string;
  /** Main colour of the belt. */
  color: string;
  /** Soft tag background and readable text on it. */
  soft: string;
  text: string;
  /** Senior belts are drawn with black stripes. */
  striped?: boolean;
};

export const BELT_LADDER: readonly Belt[] = [
  { name: "White", color: "#e4e2dd", soft: "#f1f0ed", text: "#6b6966" },
  { name: "Yellow", color: "#f2c230", soft: "#fdf3c9", text: "#8a6400" },
  { name: "Orange", color: "#e8883a", soft: "#fde8cf", text: "#9a4a00" },
  { name: "Green", color: "#3dbb6f", soft: "#d6f5df", text: "#1e7a3c" },
  { name: "Purple", color: "#a36bd4", soft: "#eadcf3", text: "#6b3fa0" },
  { name: "Blue", color: "#4aa3e0", soft: "#d9eafa", text: "#1d5fa8" },
  { name: "Brown", color: "#8b6a4e", soft: "#eadfd3", text: "#6e4520" },
  { name: "Sr. Brown", color: "#7a5a40", soft: "#e6dace", text: "#5e3c1c", striped: true },
  { name: "Red", color: "#e0493e", soft: "#fbdada", text: "#a8261d" },
  { name: "Sr. Red", color: "#e0493e", soft: "#f9d2d2", text: "#a8261d", striped: true },
];

/** Slots after white. */
export const BELT_SLOTS = BELT_LADDER.length - 1;

export function beltOf(level: number | null | undefined) {
  const safe = Math.max(0, Math.min(BELT_SLOTS, Math.floor(level ?? 0)));
  return { level: safe, ...BELT_LADDER[safe] };
}

/** CSS background for a belt swatch (stripes for senior belts). */
export function beltFill(belt: Belt) {
  return belt.striped
    ? `repeating-linear-gradient(90deg, ${belt.color} 0 3px, #1d1d1f 3px 5px)`
    : `linear-gradient(180deg, color-mix(in srgb, ${belt.color} 78%, white), ${belt.color})`;
}
