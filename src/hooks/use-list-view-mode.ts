"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ListViewMode = "list" | "grid";

const listeners = new Map<string, Set<() => void>>();

function emit(storageKey: string) {
  listeners.get(storageKey)?.forEach((listener) => listener());
}

function subscribe(storageKey: string, listener: () => void) {
  const set = listeners.get(storageKey) ?? new Set();
  set.add(listener);
  listeners.set(storageKey, set);
  return () => {
    set.delete(listener);
  };
}

function readMode(storageKey: string, fallback: ListViewMode): ListViewMode {
  const value = window.localStorage.getItem(storageKey);
  return value === "grid" || value === "list" ? value : fallback;
}

/** Persist list/grid preference per screen (localStorage). */
export function useListViewMode(storageKey: string, fallback: ListViewMode = "list") {
  const mode = useSyncExternalStore(
    (listener) => subscribe(storageKey, listener),
    () => readMode(storageKey, fallback),
    () => fallback,
  );

  const setMode = useCallback(
    (next: ListViewMode) => {
      window.localStorage.setItem(storageKey, next);
      emit(storageKey);
    },
    [storageKey],
  );

  return { mode, setMode };
}
