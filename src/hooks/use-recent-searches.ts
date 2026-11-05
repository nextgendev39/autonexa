"use client";

import { useSyncExternalStore } from "react";

const storageKey = "autonexa.recentSearches";
const empty: string[] = [];
const listeners = new Set<() => void>();
let cache = empty;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readSearches() {
  const raw = window.sessionStorage.getItem(storageKey);
  if (!raw) return empty;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed.slice(0, 5);
    }
  } catch {
    window.sessionStorage.removeItem(storageKey);
  }
  return empty;
}

function snapshot() {
  return cache;
}

function emit(next: string[]) {
  cache = next;
  listeners.forEach((listener) => listener());
}

export function useRecentSearches() {
  const items = useSyncExternalStore(
    subscribe,
    () => {
      if (cache === empty) cache = readSearches();
      return snapshot();
    },
    () => empty,
  );

  function remember(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    const current = cache === empty ? readSearches() : cache;
    const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 5);
    window.sessionStorage.setItem(storageKey, JSON.stringify(next));
    emit(next);
  }

  return { items, remember };
}
