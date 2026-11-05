"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { STOCK_AGE_KEYS } from "@/lib/vehicles/stock-age";
import {
  FUEL_TYPES,
  ORIGIN_TYPES,
  TRANSMISSION_TYPES,
  VEHICLE_MARKET_TYPES,
  VEHICLE_SORT_FIELDS,
  INVENTORY_STATUSES,
} from "@/types/vehicle";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** Filter params that count toward the "active filters" badge (excludes q/sort/page). */
export const FILTER_KEYS = [
  "status",
  "marketType",
  "branchId",
  "locationId",
  "make",
  "model",
  "yearFrom",
  "yearTo",
  "originType",
  "fuelType",
  "transmission",
  "bodyType",
  "mileageMin",
  "mileageMax",
  "purchaseDateFrom",
  "purchaseDateTo",
  "stockAge",
  "includeArchived",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS = /^\d{1,4}$/;

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function readPage(params: URLSearchParams) {
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

export function readPageSize(params: URLSearchParams) {
  const size = Number.parseInt(params.get("pageSize") ?? "", 10);
  return (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE;
}

/** Sanitises URL params into the query string accepted by GET /api/vehicles. */
export function buildApiQuery(params: URLSearchParams) {
  const out = new URLSearchParams();
  const q = params.get("q")?.trim();
  if (q) out.set("q", q);

  const status = oneOf(params.get("status"), INVENTORY_STATUSES);
  if (status) out.set("status", status);

  const marketType = oneOf(params.get("marketType"), VEHICLE_MARKET_TYPES);
  if (marketType) out.set("marketType", marketType);


  for (const key of ["branchId", "locationId"] as const) {
    const value = params.get(key);
    if (value && UUID.test(value)) out.set(key, value);
  }
  for (const key of ["make", "model", "bodyType"] as const) {
    const value = params.get(key)?.trim();
    if (value) out.set(key, value);
  }
  for (const key of ["yearFrom", "yearTo"] as const) {
    const value = params.get(key)?.trim();
    if (value && DIGITS.test(value)) out.set(key, value);
  }

  const origin = oneOf(params.get("originType"), ORIGIN_TYPES);
  if (origin) out.set("originType", origin);
  const fuel = oneOf(params.get("fuelType"), FUEL_TYPES);
  if (fuel) out.set("fuelType", fuel);
  const transmission = oneOf(params.get("transmission"), TRANSMISSION_TYPES);
  if (transmission) out.set("transmission", transmission);

  for (const key of ["mileageMin", "mileageMax"] as const) {
    const value = params.get(key)?.trim();
    if (value && /^\d+$/.test(value)) out.set(key, value);
  }
  for (const key of ["purchaseDateFrom", "purchaseDateTo"] as const) {
    const value = params.get(key)?.trim();
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) out.set(key, value);
  }

  const stockAge = oneOf(params.get("stockAge"), STOCK_AGE_KEYS);
  if (stockAge) out.set("stockAge", stockAge);

  if (params.get("includeArchived") === "true") out.set("includeArchived", "true");

  const sort = oneOf(params.get("sort"), VEHICLE_SORT_FIELDS);
  if (sort) out.set("sort", sort);
  const order = oneOf(params.get("order"), ["asc", "desc"] as const);
  if (order) out.set("order", order);

  out.set("page", String(readPage(params)));
  out.set("pageSize", String(readPageSize(params)));
  return out.toString();
}

export function countActiveFilters(params: URLSearchParams) {
  return FILTER_KEYS.filter((key) => {
    const value = params.get(key);
    return Boolean(value && value.length > 0 && value !== "false");
  }).length;
}

export function hasActiveQuery(params: URLSearchParams) {
  return countActiveFilters(params) > 0 || Boolean(params.get("q")?.trim());
}

export type UrlUpdates = Record<string, string | number | null | undefined>;

/**
 * Reads/writes inventory list state from the URL. `update` composes safely when
 * called repeatedly before React re-renders, and resets `page` unless it is
 * explicitly provided.
 */
export function useInventoryUrlState() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const latest = useRef<URLSearchParams>(new URLSearchParams(searchParams.toString()));

  useEffect(() => {
    latest.current = new URLSearchParams(searchParams.toString());
  }, [searchParams]);

  const update = useCallback(
    (updates: UrlUpdates) => {
      const next = new URLSearchParams(latest.current.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      if (!("page" in updates)) next.delete("page");
      latest.current = next;
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const clear = useCallback(() => {
    const next = new URLSearchParams();
    const pageSize = latest.current.get("pageSize");
    if (pageSize) next.set("pageSize", pageSize);
    latest.current = next;
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router]);

  return { searchParams, update, clear };
}
