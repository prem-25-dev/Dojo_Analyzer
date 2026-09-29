"use client";

import { useSyncExternalStore } from "react";

type AvatarMaps = {
  byEmail: Record<string, string>;
  byStudentId: Record<string, string>;
};

const EMPTY: AvatarMaps = { byEmail: {}, byStudentId: {} };
let maps: AvatarMaps = EMPTY;
let requested = false;
const listeners = new Set<() => void>();

function load() {
  if (requested) return;
  requested = true;
  fetch("/api/avatars")
    .then((response) => (response.ok ? response.json() : EMPTY))
    .then((result: AvatarMaps) => {
      maps = {
        byEmail: result.byEmail ?? {},
        byStudentId: result.byStudentId ?? {},
      };
      listeners.forEach((listener) => listener());
    })
    .catch(() => {
      requested = false;
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

/** Google photo for a student id or email, once the shared map has loaded. */
export function useAvatarUrl(studentId?: string | null, email?: string | null) {
  const current = useSyncExternalStore(
    subscribe,
    () => maps,
    () => EMPTY,
  );
  return (
    (studentId ? current.byStudentId[studentId] : undefined) ??
    (email ? current.byEmail[email.toLowerCase()] : undefined) ??
    null
  );
}
