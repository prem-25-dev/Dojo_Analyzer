"use client";

import { useSyncExternalStore } from "react";
import { peekCurrentUserProfile } from "@/lib/auth/profile";

const noop = () => () => {};

/**
 * The cached profile for pages reached by client navigation. While hydrating
 * a server-rendered page it returns null (matching the server's loading
 * state), so the cache can never cause a hydration mismatch.
 */
export function useCachedProfile() {
  return useSyncExternalStore(noop, peekCurrentUserProfile, () => null);
}
