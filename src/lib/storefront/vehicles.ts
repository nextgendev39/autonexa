import "server-only";

import {
  PAGE_SIZE,
  PUBLIC_VEHICLE_COLUMNS,
  toPublicVehicle,
  type ListingQuery,
  type PublicVehicle,
  type PublicVehicleRow,
} from "@/lib/storefront/public-vehicle";
import type { TenantClient } from "@/lib/server/privileged";

const PHOTO_TTL_SECONDS = 60 * 60;
const LISTED_STATUSES = ["ready_for_sale", "reserved"];

/** Only cars this dealership listed, that exist, and aren't gone. Every public read starts here. */
const listed = (client: TenantClient, options?: { count?: "exact" }) =>
  client
    .from("vehicles")
    .select(PUBLIC_VEHICLE_COLUMNS, options)
    .eq("storefront_published" as never, true as never)
    .in("status", LISTED_STATUSES as never)
    .is("deleted_at", null);

async function photosFor(client: TenantClient, vehicleIds: string[], onlyPrimary: boolean) {
  const byVehicle = new Map<string, { id: string; url: string }[]>();
  if (vehicleIds.length === 0) return byVehicle;
  const { data } = await client
    .from("vehicle_photos")
    .select("id, vehicle_id, storage_path, is_primary, sort_order")
    .in("vehicle_id", vehicleIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  let rows = (data ?? []) as unknown as { id: string; vehicle_id: string; storage_path: string }[];
  if (onlyPrimary) {
    const seen = new Set<string>();
    rows = rows.filter((row) => !seen.has(row.vehicle_id) && Boolean(seen.add(row.vehicle_id)));
  }
  if (rows.length === 0) return byVehicle;
  // Paths come from rows read through this client, and 00075 stops rows naming another's file.
  const { data: signed } = await client.storage
    .from("vehicle-photos")
    .createSignedUrls(rows.map((row) => row.storage_path), PHOTO_TTL_SECONDS);
  rows.forEach((row, index) => {
    const url = signed?.[index]?.signedUrl;
    if (url) byVehicle.set(row.vehicle_id, [...(byVehicle.get(row.vehicle_id) ?? []), { id: row.id, url }]);
  });
  return byVehicle;
}

export async function listPublicVehicles(client: TenantClient, query: ListingQuery) {
  let request = listed(client, { count: "exact" });
  // cleanTerm has removed everything that means anything in a filter expression.
  if (query.q) {
    const like = `%${query.q}%`;
    request = request.or(`make.ilike.${like},model.ilike.${like},variant.ilike.${like},custom_variant.ilike.${like}`);
  }
  if (query.make) request = request.eq("make", query.make);
  if (query.body) request = request.eq("body_type", query.body);
  if (query.fuel) request = request.eq("fuel_type", query.fuel);
  if (query.transmission) request = request.eq("transmission", query.transmission);
  if (query.yearMin !== null) request = request.gte("year", query.yearMin);
  if (query.yearMax !== null) request = request.lte("year", query.yearMax);
  if (query.priceMin !== null) request = request.gte("current_selling_price", query.priceMin);
  if (query.priceMax !== null) request = request.lte("current_selling_price", query.priceMax);
  const ordered =
    query.sort === "price_asc"
      ? request.order("current_selling_price", { ascending: true, nullsFirst: false })
      : query.sort === "price_desc"
        ? request.order("current_selling_price", { ascending: false, nullsFirst: false })
        : query.sort === "year_desc"
          ? request.order("year", { ascending: false })
          : query.sort === "mileage_asc"
            ? request.order("mileage", { ascending: true })
            : request.order("created_at", { ascending: false });
  const from = (query.page - 1) * PAGE_SIZE;
  const { data, count, error } = await ordered.order("id").range(from, from + PAGE_SIZE - 1);
  if (error) console.error("[storefront] listing failed", error.message);
  const rows = (data ?? []) as unknown as PublicVehicleRow[];
  const photos = await photosFor(client, rows.map((row) => row.id), true);
  return {
    vehicles: rows.map((row) => toPublicVehicle(row, photos.get(row.id) ?? [])),
    total: count ?? 0,
    pages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

/** Choices for the filters, from what's actually listed. */
export async function listingFacets(client: TenantClient) {
  const { data } = await client
    .from("vehicles")
    .select("make, body_type, fuel_type, transmission")
    .eq("storefront_published" as never, true as never)
    .in("status", LISTED_STATUSES as never)
    .is("deleted_at", null)
    .limit(1000);
  const rows = (data ?? []) as unknown as {
    make: string;
    body_type: string | null;
    fuel_type: string | null;
    transmission: string | null;
  }[];
  const values = (key: keyof (typeof rows)[number]) =>
    [...new Set(rows.map((row) => row[key]).filter((v): v is string => Boolean(v)))].sort();
  return { makes: values("make"), bodies: values("body_type"), fuels: values("fuel_type"), transmissions: values("transmission") };
}

/** One car by its stock number, with its internal ID kept apart: that stays on the server. */
export async function getPublicVehicle(
  client: TenantClient,
  stockNumber: string,
): Promise<{ id: string; vehicle: PublicVehicle } | null> {
  const { data } = await listed(client).eq("stock_number", stockNumber).maybeSingle();
  const row = data as unknown as PublicVehicleRow | null;
  if (!row) return null;
  const photos = await photosFor(client, [row.id], false);
  return { id: row.id, vehicle: toPublicVehicle(row, photos.get(row.id) ?? []) };
}

export async function featuredVehicles(client: TenantClient, stockNumbers: string[]) {
  if (stockNumbers.length === 0) return [];
  const { data } = await listed(client).in("stock_number", stockNumbers);
  const rows = (data ?? []) as unknown as PublicVehicleRow[];
  const photos = await photosFor(client, rows.map((row) => row.id), true);
  const byStock = new Map(rows.map((row) => [row.stock_number, toPublicVehicle(row, photos.get(row.id) ?? [])]));
  return stockNumbers.flatMap((stock) => byStock.get(stock) ?? []);
}

export async function latestVehicles(client: TenantClient, limit = 6) {
  const { data } = await listed(client).order("created_at", { ascending: false }).limit(limit);
  const rows = (data ?? []) as unknown as PublicVehicleRow[];
  const photos = await photosFor(client, rows.map((row) => row.id), true);
  return rows.map((row) => toPublicVehicle(row, photos.get(row.id) ?? []));
}

export async function allListedStockNumbers(client: TenantClient) {
  const { data } = await client
    .from("vehicles")
    .select("stock_number, updated_at")
    .eq("storefront_published" as never, true as never)
    .in("status", LISTED_STATUSES as never)
    .is("deleted_at", null)
    .limit(5000);
  return (data ?? []) as unknown as { stock_number: string; updated_at: string }[];
}
