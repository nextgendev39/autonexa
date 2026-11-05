"use client";

import { useSyncExternalStore } from "react";

/**
 * The current time, re-rendering every `intervalMs`. Null during the server render and
 * hydration, so countdowns never mismatch; callers show a placeholder until it's known.
 */
export function useNow(intervalMs = 1000): number | null {
  return useSyncExternalStore(
    (notify) => {
      const timer = window.setInterval(notify, intervalMs);
      return () => window.clearInterval(timer);
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => null,
  );
}
