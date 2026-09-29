"use client";

import { useEffect, useState } from "react";
import {
  buildModel,
  movement,
  snapshot,
  type DashboardData,
} from "@/lib/dashboard/metrics";

export type DashboardHeadline = {
  week: number;
  beltsGained: number;
  tested: number;
  students: number;
};

// One request per page load, shared by every caller.
let pending: Promise<DashboardHeadline | null> | null = null;

function loadHeadline() {
  pending ??= fetch("/api/dashboard/overview")
    .then(async (response) => {
      if (!response.ok) return null;
      const model = buildModel((await response.json()) as DashboardData);
      const week = model.weekNumbers.at(-1);
      if (week === undefined) return null;
      const shot = snapshot(model, week);
      return {
        week,
        beltsGained: movement(model, week).beltsGained,
        tested: shot.tested,
        students: shot.students,
      };
    })
    .catch(() => null);
  return pending;
}

/** Latest week's belts gained and students tested, for the navbar. */
export function useDashboardHeadline(enabled: boolean) {
  const [headline, setHeadline] = useState<DashboardHeadline | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadHeadline().then((result) => {
      if (active) setHeadline(result);
    });
    return () => {
      active = false;
    };
  }, [enabled]);
  return headline;
}
