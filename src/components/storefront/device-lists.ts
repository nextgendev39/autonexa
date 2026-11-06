"use client";

import { useSyncExternalStore } from "react";

/**
 * Lists kept in the visitor's browser: saved cars and recently viewed cars. Only stock numbers are
 * stored, never anything about the visitor, and each dealership's host has its own storage.
 */
const LIMITS = { saved: 50, recent: 12 } as const;
export type DeviceList = keyof typeof LIMITS;

const key = (list: DeviceList) => `autonexa.storefront.${list}`;
const listeners = new Set<() => void>();
const cache = new Map<DeviceList, { raw: string | null; value: string[] }>();
const EMPTY: string[] = [];

const STOCK = /^[\p{L}\p{N} ._/-]{1,60}$/u;

function read(list: DeviceList): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key(list));
  } catch {
    return EMPTY;
  }
  const cached = cache.get(list);
  if (cached && cached.raw === raw) return cached.value;
  let value: string[] = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    value = Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === "string" && STOCK.test(item))
          .slice(0, LIMITS[list])
      : EMPTY;
  } catch {
    value = EMPTY;
  }
  cache.set(list, { raw, value });
  return value;
}

function write(list: DeviceList, value: string[]) {
  try {
    localStorage.setItem(key(list), JSON.stringify(value.slice(0, LIMITS[list])));
  } catch {
    /* Private mode or full storage: the list just isn't kept. */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith("autonexa.storefront.")) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDeviceList(list: DeviceList) {
  return useSyncExternalStore(
    subscribe,
    () => read(list),
    () => EMPTY,
  );
}

export function toggleSaved(stockNumber: string) {
  const current = read("saved");
  write(
    "saved",
    current.includes(stockNumber)
      ? current.filter((s) => s !== stockNumber)
      : [stockNumber, ...current],
  );
}

export function clearList(list: DeviceList) {
  write(list, []);
}

export function rememberViewed(stockNumber: string) {
  write("recent", [stockNumber, ...read("recent").filter((s) => s !== stockNumber)]);
}
