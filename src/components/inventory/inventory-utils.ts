"use client";

import { useLocale } from "next-intl";

import { appConfig, isAppLocale, type AppLocale } from "@/config/app";

export function useAppLocale(): AppLocale {
  const value = useLocale();
  return isAppLocale(value) ? value : appConfig.defaultLocale;
}

/** "Sports Car" -> "sports_car" (matches inventory.enums.bodyType keys). */
export function bodyTypeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

type Translator = {
  (key: string, values?: Record<string, string | number>): string;
  has: (key: string) => boolean;
};

export function bodyTypeLabel(t: Translator, value: string | null | undefined) {
  if (!value) return null;
  const key = `inventory.enums.bodyType.${bodyTypeKey(value)}`;
  return t.has(key) ? t(key) : value;
}

export function enumLabel(
  t: Translator,
  group: "transmission" | "fuel" | "drive" | "origin" | "mileageUnit",
  value: string | null | undefined,
) {
  if (!value) return null;
  const key = `inventory.enums.${group}.${value}`;
  return t.has(key) ? t(key) : value;
}

export function vehicleTitle(vehicle: { year: number; make: string; model: string; variant?: string | null }) {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.variant].filter(Boolean).join(" ");
}

/** Normalises a DB date/timestamp to the YYYY-MM-DD value used by date inputs. */
export function toDateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}
