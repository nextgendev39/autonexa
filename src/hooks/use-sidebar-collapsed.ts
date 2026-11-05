"use client";

import { useSyncExternalStore } from "react";

const storageKey = "autonexa.sidebar.collapsed";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function collapsedNow() {
  return window.localStorage.getItem(storageKey) === "1";
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, collapsedNow, () => false);

  function toggle() {
    window.localStorage.setItem(storageKey, collapsed ? "0" : "1");
    emit();
  }

  return { collapsed, toggle };
}
